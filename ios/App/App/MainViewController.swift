//
//  MainViewController.swift
//  App
//
//  Custom Capacitor bridge view controller. Capacitor 8 auto-registers only the plugins
//  listed in the cap-sync-generated config (i.e. npm-installed packages); an APP-LOCAL
//  Swift plugin like AgeRangePlugin must be registered by hand here. Without this, the
//  bridge never exposes `window.Capacitor.Plugins.AgeRange` and the JS bridge silently
//  falls back (dev stub in dev, "unavailable" in prod).
//
//  Wired via Main.storyboard: the root view controller's customClass is set to
//  MainViewController (module "App"). AppDelegate's `as? CAPBridgeViewController` cast
//  still holds since this subclasses it.
//

import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AgeRangePlugin())
    }
}
