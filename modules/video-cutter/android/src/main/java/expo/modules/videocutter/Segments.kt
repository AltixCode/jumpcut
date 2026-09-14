package expo.modules.videocutter

import org.json.JSONArray

/**
 * The time ranges to keep, in microseconds.
 *
 * Which ranges those are was decided in TypeScript, where it is tested. This
 * only reads them and answers two questions about a frame: is it in a range,
 * and how much time before it has been removed.
 */
internal class Segments(private val ranges: List<LongRange>) {

  val isEmpty: Boolean get() = ranges.isEmpty()

  /** Total kept duration, in microseconds. */
  val keptUs: Long get() = ranges.sumOf { it.last - it.first }

  fun contains(timeUs: Long): Boolean = ranges.any { timeUs >= it.first && timeUs < it.last }

  /**
   * The presentation time a kept frame should carry once the gaps before it are
   * gone.
   *
   * Returns null for a frame in no range, which is a frame that is not written.
   */
  fun remap(timeUs: Long): Long? {
    var elapsed = 0L
    for (range in ranges) {
      if (timeUs < range.first) return null
      if (timeUs < range.last) return elapsed + (timeUs - range.first)
      elapsed += range.last - range.first
    }
    return null
  }

  companion object {
    fun parse(json: String, durationUs: Long): Segments? {
      val array = runCatching { JSONArray(json) }.getOrNull() ?: return null
      val ranges = mutableListOf<LongRange>()
      for (index in 0 until array.length()) {
        val entry = array.optJSONObject(index) ?: continue
        // Seconds on the wire, microseconds here: every Android media API works
        // in microseconds, and mixing the two puts the whole cut in the first
        // millisecond of the clip.
        val start = (entry.optDouble("start", -1.0) * 1_000_000).toLong()
        val end = (entry.optDouble("end", -1.0) * 1_000_000).toLong()
        if (start < 0 || end <= start) continue
        // Clamped rather than trusted: a range computed from a rounded duration
        // can overshoot the end of the file by a frame.
        val from = start.coerceIn(0, durationUs)
        val to = end.coerceIn(from, durationUs)
        if (to - from < 10_000) continue
        ranges.add(from..to)
      }
      if (ranges.isEmpty()) return null
      return Segments(ranges.sortedBy { it.first })
    }
  }
}
