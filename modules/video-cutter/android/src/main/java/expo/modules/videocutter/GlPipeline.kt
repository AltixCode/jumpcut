package expo.modules.videocutter

import android.graphics.SurfaceTexture
import android.os.Handler
import android.os.HandlerThread
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLExt
import android.opengl.EGLSurface
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.view.Surface
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * Moves decoded frames into the encoder's input surface.
 *
 * Nothing is drawn on them -- the cut only decides which frames are written and
 * when -- but the pass is still necessary. MediaCodec hands decoded frames to a
 * Surface and takes encoded input from one, and the only way between the two is
 * a texture. Reading frames back to Bitmaps instead would mean a YUV conversion
 * per frame in software, which turns a short export into minutes.
 */
internal class GlPipeline(private val encoderSurface: Surface) {

  private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
  private var context: EGLContext = EGL14.EGL_NO_CONTEXT
  private var surface: EGLSurface = EGL14.EGL_NO_SURFACE

  private var frameProgram = 0
  private var frameTexture = 0

  lateinit var surfaceTexture: SurfaceTexture
    private set
  lateinit var decoderSurface: Surface
    private set

  private val transform = FloatArray(16)
  private val frameLock = Object()
  private var frameAvailable = false

  /**
   * The thread the frame callback is delivered on.
   *
   * SurfaceTexture's no-handler overload posts to the registering thread's
   * Looper, or the main thread's if it has none. The burn runs on a background
   * executor with no Looper, so the callback ends up queued behind whatever the
   * UI is doing -- and if it never runs, the burn waits for a frame that has
   * already arrived. Owning the Looper removes the guesswork.
   */
  private val callbackThread = HandlerThread("capflow.burn.frames")

  private val quad: FloatBuffer = ByteBuffer.allocateDirect(8 * 4)
    .order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
      put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f))
      position(0)
    }

  fun setUp() {
    display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
    val version = IntArray(2)
    check(EGL14.eglInitialize(display, version, 0, version, 1)) { "eglInitialize failed" }

    val configs = arrayOfNulls<EGLConfig>(1)
    val configCount = IntArray(1)
    val attributes = intArrayOf(
      EGL14.EGL_RED_SIZE, 8,
      EGL14.EGL_GREEN_SIZE, 8,
      EGL14.EGL_BLUE_SIZE, 8,
      EGL14.EGL_ALPHA_SIZE, 8,
      EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
      // Without this the encoder rejects the surface on many devices.
      EGLExt.EGL_RECORDABLE_ANDROID, 1,
      EGL14.EGL_NONE,
    )
    check(EGL14.eglChooseConfig(display, attributes, 0, configs, 0, 1, configCount, 0) && configCount[0] > 0) {
      "no recordable EGL config"
    }

    context = EGL14.eglCreateContext(
      display, configs[0], EGL14.EGL_NO_CONTEXT,
      intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0,
    )
    surface = EGL14.eglCreateWindowSurface(
      display, configs[0], encoderSurface, intArrayOf(EGL14.EGL_NONE), 0,
    )
    check(EGL14.eglMakeCurrent(display, surface, surface, context)) { "eglMakeCurrent failed" }

    frameProgram = buildProgram(VERTEX_SHADER, OES_FRAGMENT_SHADER)

    val textures = IntArray(1)
    GLES20.glGenTextures(1, textures, 0)
    frameTexture = textures[0]

    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, frameTexture)
    setTextureParameters(GLES11Ext.GL_TEXTURE_EXTERNAL_OES)

    surfaceTexture = SurfaceTexture(frameTexture)
    callbackThread.start()
    surfaceTexture.setOnFrameAvailableListener({
      synchronized(frameLock) {
        frameAvailable = true
        frameLock.notifyAll()
      }
    }, Handler(callbackThread.looper))
    decoderSurface = Surface(surfaceTexture)
  }

  /**
   * Blocks until the decoder has produced a frame, then binds it.
   *
   * The timeout is generous because it is a liveness check, not a deadline: an
   * emulator with a software GL path takes the better part of a second per
   * frame, and failing there would report a broken pipeline where there is only
   * a slow one.
   */
  fun awaitFrame(timeoutMs: Long = 20_000): Boolean {
    synchronized(frameLock) {
      val deadline = System.currentTimeMillis() + timeoutMs
      while (!frameAvailable) {
        val remaining = deadline - System.currentTimeMillis()
        if (remaining <= 0) return false
        frameLock.wait(remaining)
      }
      frameAvailable = false
    }
    surfaceTexture.updateTexImage()
    surfaceTexture.getTransformMatrix(transform)
    return true
  }

  fun drawFrame(width: Int, height: Int) {
    GLES20.glViewport(0, 0, width, height)
    GLES20.glClearColor(0f, 0f, 0f, 1f)
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
    draw(frameProgram, GLES11Ext.GL_TEXTURE_EXTERNAL_OES, frameTexture, transform)
  }

  fun present(timestampNs: Long) {
    EGLExt.eglPresentationTimeANDROID(display, surface, timestampNs)
    EGL14.eglSwapBuffers(display, surface)
  }

  fun release() {
    if (display != EGL14.EGL_NO_DISPLAY) {
      EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
      EGL14.eglDestroySurface(display, surface)
      EGL14.eglDestroyContext(display, context)
      EGL14.eglReleaseThread()
      EGL14.eglTerminate(display)
    }
    display = EGL14.EGL_NO_DISPLAY
    context = EGL14.EGL_NO_CONTEXT
    surface = EGL14.EGL_NO_SURFACE
    if (::decoderSurface.isInitialized) decoderSurface.release()
    if (::surfaceTexture.isInitialized) surfaceTexture.release()
    if (callbackThread.isAlive) callbackThread.quitSafely()
  }

  private fun draw(program: Int, target: Int, texture: Int, matrix: FloatArray) {
    GLES20.glUseProgram(program)
    GLES20.glDisable(GLES20.GL_BLEND)

    val position = GLES20.glGetAttribLocation(program, "aPosition")
    GLES20.glEnableVertexAttribArray(position)
    quad.position(0)
    GLES20.glVertexAttribPointer(position, 2, GLES20.GL_FLOAT, false, 8, quad)

    GLES20.glUniformMatrix4fv(GLES20.glGetUniformLocation(program, "uTransform"), 1, false, matrix, 0)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(target, texture)
    GLES20.glUniform1i(GLES20.glGetUniformLocation(program, "uTexture"), 0)

    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    GLES20.glDisableVertexAttribArray(position)
  }

  private fun setTextureParameters(target: Int) {
    GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
  }

  private fun buildProgram(vertex: String, fragment: String): Int {
    val program = GLES20.glCreateProgram()
    GLES20.glAttachShader(program, compile(GLES20.GL_VERTEX_SHADER, vertex))
    GLES20.glAttachShader(program, compile(GLES20.GL_FRAGMENT_SHADER, fragment))
    GLES20.glLinkProgram(program)
    val linked = IntArray(1)
    GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linked, 0)
    check(linked[0] == GLES20.GL_TRUE) { "shader link failed: ${GLES20.glGetProgramInfoLog(program)}" }
    return program
  }

  private fun compile(type: Int, source: String): Int {
    val shader = GLES20.glCreateShader(type)
    GLES20.glShaderSource(shader, source)
    GLES20.glCompileShader(shader)
    val compiled = IntArray(1)
    GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compiled, 0)
    check(compiled[0] == GLES20.GL_TRUE) { "shader compile failed: ${GLES20.glGetShaderInfoLog(shader)}" }
    return shader
  }

  private companion object {
    const val VERTEX_SHADER = """
      attribute vec4 aPosition;
      uniform mat4 uTransform;
      varying vec2 vTexCoord;
      void main() {
        gl_Position = aPosition;
        vec4 coord = vec4(aPosition.x * 0.5 + 0.5, aPosition.y * 0.5 + 0.5, 0.0, 1.0);
        vTexCoord = (uTransform * coord).xy;
      }
    """

    const val OES_FRAGMENT_SHADER = """
      #extension GL_OES_EGL_image_external : require
      precision mediump float;
      varying vec2 vTexCoord;
      uniform samplerExternalOES uTexture;
      void main() { gl_FragColor = texture2D(uTexture, vTexCoord); }
    """
  }
}
