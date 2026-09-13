const {
  withInfoPlist,
  withAppDelegate,
  createRunOncePlugin,
} = require("@expo/config-plugins");

/**
 * Adopts the UIScene lifecycle on iOS.
 *
 * iOS 26/27 raise a runtime issue for any app that still drives its window from
 * UIApplicationDelegate alone. On a simulator that runtime issue is fatal: the
 * app traps in `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`
 * with EXC_BREAKPOINT before the first frame renders. Expo SDK 57 does not yet
 * emit a scene delegate (see the "Configuring and Discarding Scenes" TODO in
 * ExpoAppDelegateSubscriberManager), so the adoption is added here.
 *
 * The SceneDelegate is appended into AppDelegate.swift rather than written as a
 * separate source file, because a new file would also have to be registered in
 * the Xcode project, and `expo prebuild` regenerates that project every run.
 */

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: "Default Configuration",
        UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
      },
    ],
  },
};

const withSceneInfoPlist = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    // RCTStatusBarManager refuses to manage the status bar unless this is
    // false, and losing it turns every StatusBar style change into a no-op.
    cfg.modResults.UIViewControllerBasedStatusBarAppearance = false;
    return cfg;
  });

/** The window bootstrap Expo generates inside didFinishLaunchingWithOptions. */
const WINDOW_BOOTSTRAP =
  /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\([\s\S]*?\)\s*\n\s*#endif\s*\n/;

const SCENE_DELEGATE_SOURCE = `
// MARK: - UIScene lifecycle (added by withIOSSceneLifecycle)

extension AppDelegate {
  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Mirrored onto the app delegate so code that still reaches for
    // UIApplication.shared.delegate?.window — expo-splash-screen among it —
    // finds the live window rather than nil.
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: connectionOptions.notificationResponse?.notification.request.content.userInfo
    )

    // A cold launch opened from a deep link delivers the URL here, not through
    // application(_:open:options:).
    if let urlContext = connectionOptions.urlContexts.first {
      RCTLinkingManager.application(UIApplication.shared, open: urlContext.url, options: [:])
    }
    if let userActivity = connectionOptions.userActivities.first {
      RCTLinkingManager.application(
        UIApplication.shared,
        continue: userActivity,
        restorationHandler: { _ in }
      )
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }
}
`;

const withSceneAppDelegate = (config) =>
  withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") {
      throw new Error(
        `withIOSSceneLifecycle expects a Swift AppDelegate, found "${cfg.modResults.language}".`,
      );
    }

    let contents = cfg.modResults.contents;

    if (contents.includes("class SceneDelegate")) {
      return cfg;
    }

    if (!WINDOW_BOOTSTRAP.test(contents)) {
      throw new Error(
        "withIOSSceneLifecycle could not find the generated window bootstrap in AppDelegate.swift. " +
          "The Expo template has changed; update the plugin before building.",
      );
    }

    // The window now belongs to the scene, so the delegate must not create one
    // of its own — two windows would leave a blank key window on screen.
    contents = contents.replace(WINDOW_BOOTSTRAP, "");
    cfg.modResults.contents = `${contents}\n${SCENE_DELEGATE_SOURCE}`;
    return cfg;
  });

const withIOSSceneLifecycle = (config) =>
  withSceneAppDelegate(withSceneInfoPlist(config));

module.exports = createRunOncePlugin(
  withIOSSceneLifecycle,
  "with-ios-scene-lifecycle",
  "1.0.0",
);
