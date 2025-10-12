import fs from "fs";
import path from "path";
import debug from "debug";
import { LogLevel } from "@matter/main";

import log from "./loggers.js";
import * as matter from "./matter/controller.js";

const CFG_FILENAME = "driver_config.json";

enum TemperatureUnit {
  Celcius = 0,
  Fahrenheit = 1
}

class DriverSettings {
  matterUniqueId: string | undefined;
  matterFabricLabel: string | undefined;
  // in tenths of a second
  lightTransitionTime: number = 10;
  temperatureUnit: TemperatureUnit = TemperatureUnit.Celcius;
  driverLogLevel: number = 4;
  matterLogLevel: number = 4;
  ucapiLogLevel: number = 4;
}

/**
 * Integration driver configuration class. Manages all configured Dreambox devices.
 */
class DriverConfig {
  #config: DriverSettings;
  #dataPath = "";
  #cfgFilePath = "";

  constructor() {
    this.#config = new DriverSettings();
  }

  /**
   * Return the configuration path.
   * @return {string}
   */
  get dataPath(): string {
    return this.#dataPath;
  }

  /**
   * Initialize integration configuration from configuration file.
   *
   * @param {string} dataPath Configuration path for the configuration file.
   * @return true if configuration could be loaded, false otherwise.
   */
  init(dataPath: string) {
    this.#dataPath = dataPath;
    this.#cfgFilePath = path.join(dataPath, CFG_FILENAME);

    let loaded = this.load();
    return loaded;
  }

  /**
   * Update integration configuration.
   *
   * @param {DriverSettings} driverSettings
   */
  update(driverSettings: DriverSettings) {
    this.#config = driverSettings;
    this.store();
  }

  setLogLevels() {
    matter.controllerNode.setLogLevel(LogLevel(this.#config.matterLogLevel.toString()));

    debug.disable();
    let debugNamespaces: string[] = [];

    if (this.#config.driverLogLevel < 1) debugNamespaces.push("driver:trace");
    if (this.#config.driverLogLevel < 2) debugNamespaces.push("driver:debug");
    if (this.#config.driverLogLevel < 3) debugNamespaces.push("driver:info");
    if (this.#config.driverLogLevel < 4) debugNamespaces.push("driver:warn");
    if (this.#config.driverLogLevel < 5) debugNamespaces.push("driver:error");

    if (this.#config.ucapiLogLevel < 1) debugNamespaces.push("ucapi:msg");
    if (this.#config.ucapiLogLevel < 2) debugNamespaces.push("ucapi:debug");
    if (this.#config.ucapiLogLevel < 3) debugNamespaces.push("ucapi:info");
    if (this.#config.ucapiLogLevel < 4) debugNamespaces.push("ucapi:warn");
    if (this.#config.ucapiLogLevel < 5) debugNamespaces.push("ucapi:error");

    debug.enable(debugNamespaces.join(","));
  }

  /**
   * Get integration configuration for given identifier.
   * @return {DriverSettings}
   */
  get(): DriverSettings {
    return this.#config;
  }

  /**
   * Clear configuration and remove configuration file.
   */
  clear() {
    this.#config = new DriverSettings();
    if (fs.existsSync(this.#cfgFilePath)) {
      fs.unlink(this.#cfgFilePath, (e) => {
        if (e) {
          log.error("Could not delete configuration file. %s", e);
        }
      });
    }
  }

  /**
   * Store the configuration file.
   * @return {boolean} true if the configuration could be saved.
   */
  store(): boolean {
    try {
      fs.writeFileSync(this.#cfgFilePath, JSON.stringify(this.#config), "utf-8");
      return true;
    } catch (err) {
      log.error("Cannot write the config file:", err);
      return false;
    }
  }

  /**
   * Load the configuration from the configuration file.
   * @return {boolean} true if the configuration could be loaded.
   */
  load(): boolean {
    if (!fs.existsSync(this.#cfgFilePath)) {
      log.info("No configuration file found, using default configuration.");
      return false;
    }
    try {
      let parsed: Partial<DriverSettings> = JSON.parse(fs.readFileSync(this.#cfgFilePath, "utf8"));
      this.#config = Object.assign(new DriverSettings(), parsed);
      return true;
    } catch (err) {
      log.error("Cannot open the config file: %s", err);
      return false;
    }
  }
}

const driverConfig = new DriverConfig();

export { DriverSettings, TemperatureUnit, driverConfig };
