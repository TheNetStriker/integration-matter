import * as uc from "@unfoldedcircle/integration-api";
import { NodeId } from "@matter/main";

import log from "./loggers.js";
import * as matter from "./matter_controller.js";
import { initializeAndStartMatterController } from "./driver.js";
import { driverConfig } from "./config.js";

enum SetupSteps {
  INIT = 0,
  DRIVER_CONFIG = 1,
  MATTER_SETUP = 2,
  MATTER_COMMISSIONING = 3,
  MATTER_STRUCTURE_DEBUG_OUTPUT = 4,
  CONFIGURATION_MODE = 5
}

var setupStep = SetupSteps.INIT;
var reconfigure: boolean;

async function userInputDriverConfig(): Promise<uc.RequestUserInput> {
  let config = driverConfig.get();

  return new uc.RequestUserInput({ en: "Driver configuration", de: "Treiber Konfiguration" }, [
    {
      // number between 0 and 65535
      id: "lightTransitionTime",
      label: {
        en: "Light transition time in tenths of a second (between 0 and 65535)",
        de: "Licht Übergangszeit in Zehntelsekunden (Zwischen 0 and 65535)"
      },
      field: {
        text: {
          value: config.lightTransitionTime.toString(),
          regex: `^(?:6553[0-5]|655[0-2]\\d|65[0-4]\\d{2}|6[0-4]\\d{3}|[1-5]?\\d{1,4}|0)$`
        }
      }
    },
    {
      // max 32 characters
      id: "matterFabricLabel",
      label: { en: "Matter fabric label", de: "Matter fabric label" },
      field: { text: { value: config.matterFabricLabel, regex: `^[A-Za-z0-9 ]{1,32}$` } }
    },
    {
      field: {
        dropdown: {
          value: config.driverLogLevel.toString(),
          items: [
            { id: "0", label: { en: "TRACE" } },
            { id: "1", label: { en: "DEBUG" } },
            { id: "2", label: { en: "INFO" } },
            { id: "3", label: { en: "WARN" } },
            { id: "4", label: { en: "ERROR" } }
          ]
        }
      },
      id: "driverLogLevel",
      label: { en: "Driver log level", de: "Driver Log Level" }
    },
    {
      field: {
        dropdown: {
          value: config.matterLogLevel.toString(),
          items: [
            { id: "0", label: { en: "DEBUG" } },
            { id: "1", label: { en: "INFO" } },
            { id: "2", label: { en: "NOTICE" } },
            { id: "3", label: { en: "WARN" } },
            { id: "4", label: { en: "ERROR" } },
            { id: "5", label: { en: "FATAL" } }
          ]
        }
      },
      id: "matterLogLevel",
      label: { en: "Matter log level", de: "Matter Log Level" }
    },
    {
      field: {
        dropdown: {
          value: config.ucapiLogLevel.toString(),
          items: [
            { id: "0", label: { en: "TRACE" } },
            { id: "1", label: { en: "DEBUG" } },
            { id: "2", label: { en: "INFO" } },
            { id: "3", label: { en: "WARN" } },
            { id: "4", label: { en: "ERROR" } }
          ]
        }
      },
      id: "ucapiLogLevel",
      label: { en: "Unfolded Circle API log level", de: "Unfolded Circle API Log Level" }
    }
  ]);
}

function userInputMatterSettings(): uc.RequestUserInput {
  return new uc.RequestUserInput({ en: "Pair this matter controller.", de: "Diesen Matter Controller koppeln." }, [
    {
      id: "pairingCode",
      label: { en: "Matter pairing code", de: "Matter pairing code" },
      field: { text: { value: "", regex: `^\d{11,21}$` } }
    }
  ]);
}

function userInputMatterCommissioningPairingCode(
  manualPairingCode: string,
  qrPairingCode: string
): uc.RequestUserInput {
  return new uc.RequestUserInput(
    { en: "Pair another Matter device to this controller.", de: "Weiteres Matter Gerät zu diesem Controller koppeln." },
    [
      {
        id: "manualPairingCode",
        label: { en: "Manual pairing code", de: "Manueller pairing code" },
        field: { label: { value: { en: manualPairingCode } } }
      },
      {
        id: "qrPairingCode",
        label: { en: "QR pairing code", de: "QR pairing code" },
        field: { label: { value: { en: qrPairingCode } } }
      }
    ]
  );
}

async function userInputMatterStructureDebugOutput(nodeId: string): Promise<uc.RequestUserInput> {
  const nodeStructure = await matter.controllerNode.getNodeStructure(NodeId(nodeId));

  return new uc.RequestUserInput({ en: "Matter device structure", de: "Matter Gerätestruktur" }, [
    {
      id: "matterStructureDebugOutput",
      label: { en: "Matter device structure", de: "Matter Gerätestruktur" },
      field: { textarea: { value: nodeStructure } }
    }
  ]);
}

async function waitForMatterControllerStart(interval: number = 500): Promise<boolean> {
  const timeout = 30000;
  const start = Date.now();

  while (true) {
    const result = matter.controllerNode.isStarted();
    if (result) return result;
    if (Date.now() - start >= timeout) {
      return false;
    }
    await new Promise((res) => setTimeout(res, interval));
  }
}

/**
 * Start driver config setup.
 *
 * Initiated by the UC Remote to set up the driver.
 * @param {uc.DriverSetupRequest} msg value(s) of input fields in the first setup screen.
 * @return the SetupAction on how to continue
 */
async function handleDriverConfigRequest(msg: uc.DriverSetupRequest): Promise<uc.SetupAction> {
  reconfigure = msg.reconfigure;
  log.debug(`Starting app configuration, reconfigure=${reconfigure}`);

  // workaround for web-configurator not picking up first response
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (!matter.controllerNode.isInitialized()) {
    await initializeAndStartMatterController(true);
  }

  if (reconfigure) {
    var matterControllerStarted = await waitForMatterControllerStart();
    if (!matterControllerStarted) {
      log.debug("Controller not yet started, abort setup.");
      return new uc.SetupError(uc.IntegrationSetupError.Other);
    }

    setupStep = SetupSteps.CONFIGURATION_MODE;

    // get all configured devices for the user to choose from
    const dropdownDevices: Array<{ id: string; label: { en: string } }> = [];
    for (const matterBridge of await matter.controllerNode.getMatterBridges()) {
      dropdownDevices.push({
        id: matterBridge.id.toString(),
        label: { en: `${matterBridge.label} (${matterBridge.id.toString()})` }
      });
    }

    // build user actions, based on available devices
    let selectedActionIndex = 0;
    const dropdownActions: Array<{
      id: string;
      label: {
        [key: string]: string;
      };
    }> = [
      {
        id: "add",
        label: { en: "Add new matter device", de: "Neues Matter Gerät hinzufügen" }
      },
      {
        id: "driverconfig",
        label: { en: "Driver configuration", de: "Treiber Konfiguration" }
      }
    ];

    // add remove & reset actions if there's at least one configured device
    if (dropdownDevices.length > 0) {
      // pre-select configure action if at least one device exists
      selectedActionIndex = 1;

      dropdownActions.push({
        id: "openEnhancedCommissioningWindow",
        label: {
          en: "Generate pairing code for another Matter device",
          de: "Pairing code generieren für weiteres Matter Gerät"
        }
      });

      dropdownActions.push({
        id: "matterStructureDebugOutput",
        label: {
          en: "Matter structure debug output",
          de: "Matter Struktur Debug Ausgabe"
        }
      });

      dropdownActions.push({
        id: "remove",
        label: { en: "Decommission matter device", de: "Matter Gerät trennen und entfernen" }
      });

      dropdownActions.push({
        id: "forceremove",
        label: { en: "Force remove matter device", de: "Matter Gerät erzwungen entfernen" }
      });

      dropdownActions.push({
        id: "reset",
        label: { en: "Reset configuration", de: "Konfiguration zurücksetzen" }
      });
    } else {
      // dummy entry if no devices are available
      dropdownDevices.push({ id: "", label: { en: "---" } });
    }

    return new uc.RequestUserInput({ en: "Configuration mode", de: "Konfigurations-Modus" }, [
      {
        field: {
          dropdown: {
            value: dropdownDevices[0].id,
            items: dropdownDevices
          }
        },
        id: "choice",
        label: { en: "Configured devices", de: "Konfigurierte Geräte" }
      },
      {
        field: {
          dropdown: {
            value: dropdownActions[selectedActionIndex].id,
            items: dropdownActions
          }
        },
        id: "action",
        label: { en: "Action", de: "Aktion" }
      }
    ]);
  }

  // Wait for matter controller to start
  var matterControllerStarted = await waitForMatterControllerStart();

  if (!matterControllerStarted) {
    return new uc.SetupError();
  }

  setupStep = SetupSteps.DRIVER_CONFIG;
  return userInputDriverConfig();
}

async function handleDriverConfigDataResponse(msg: uc.UserDataResponse): Promise<uc.SetupComplete | uc.SetupError> {
  const lightTransitionTime = msg.inputValues["lightTransitionTime"];
  const matterFabricLabel = msg.inputValues["matterFabricLabel"];
  const driverLogLevel = msg.inputValues["driverLogLevel"];
  const matterLogLevel = msg.inputValues["matterLogLevel"];
  const ucapiLogLevel = msg.inputValues["ucapiLogLevel"];

  await matter.controllerNode.updateFabricLabel(matterFabricLabel);

  let config = driverConfig.get();

  config.matterFabricLabel = matterFabricLabel;
  config.lightTransitionTime = Number(lightTransitionTime);
  config.driverLogLevel = Number(driverLogLevel);
  config.matterLogLevel = Number(matterLogLevel);
  config.ucapiLogLevel = Number(ucapiLogLevel);

  driverConfig.update(config);
  driverConfig.setLogLevels();
  driverConfig.store();

  if (reconfigure || matter.controllerNode.isCommissioned()) {
    return new uc.SetupComplete();
  }

  setupStep = SetupSteps.MATTER_SETUP;
  return userInputMatterSettings();
}

async function handleConfigurationMode(
  msg: uc.UserDataResponse
): Promise<uc.RequestUserInput | uc.SetupComplete | uc.SetupError> {
  const action = msg.inputValues["action"];

  // workaround for web-configurator not picking up first response
  await new Promise((resolve) => setTimeout(resolve, 1000));

  switch (action) {
    case "add":
      break;
    case "remove":
    case "forceremove": {
      const choice = msg.inputValues["choice"];

      try {
        await matter.controllerNode.removeNode(NodeId(choice), action == "forceremove");
      } catch (e) {
        log.error(e);
        return new uc.SetupError();
      }

      return new uc.SetupComplete();
    }
    case "driverconfig": {
      // Reconfigure driver configuration
      setupStep = SetupSteps.DRIVER_CONFIG;
      return userInputDriverConfig();
    }
    case "openEnhancedCommissioningWindow": {
      const choice = msg.inputValues["choice"];

      setupStep = SetupSteps.MATTER_COMMISSIONING;
      let pairingCodes = await matter.controllerNode.openEnhancedCommissioningWindow(NodeId(choice));

      if (pairingCodes) {
        return userInputMatterCommissioningPairingCode(pairingCodes.manualPairingCode, pairingCodes.qrPairingCode);
      }

      return new uc.SetupError(uc.IntegrationSetupError.NotFound);
    }
    case "matterStructureDebugOutput":
      const choice = msg.inputValues["choice"];
      setupStep = SetupSteps.MATTER_STRUCTURE_DEBUG_OUTPUT;
      return userInputMatterStructureDebugOutput(choice);
    case "reset":
      matter.controllerNode.reset();
      break;
    default:
      log.error(`Invalid configuration action: ${action}`);
      return new uc.SetupError(uc.IntegrationSetupError.Other);
  }

  setupStep = SetupSteps.MATTER_SETUP;
  return userInputMatterSettings();
}

async function handleMatterSetupDataResponse(msg: uc.UserDataResponse): Promise<uc.SetupComplete | uc.SetupError> {
  const pairingCode = msg.inputValues["pairingCode"];

  log.debug(`Starting manual driver setup with pairingCode ${pairingCode}`);

  try {
    const nodeId = await matter.controllerNode.pair(pairingCode);

    if (!nodeId) return new uc.SetupError(uc.IntegrationSetupError.ConnectionRefused);

    log.info(`Setup successfully completed for ${nodeId}`);
    return new uc.SetupComplete();
  } catch (error) {
    log.error(`Cannot connect to manually entered pairingCode ${pairingCode}: ${error}`);
    return new uc.SetupError(uc.IntegrationSetupError.ConnectionRefused);
  }
}

const driverSetupHandler = async function (msg: any): Promise<uc.SetupAction> {
  try {
    if (msg instanceof uc.DriverSetupRequest) {
      setupStep = SetupSteps.INIT;
      reconfigure = false;
      return await handleDriverConfigRequest(msg);
    }

    if (msg instanceof uc.UserDataResponse) {
      log.debug("UserDataResponse: %s %s", msg, setupStep);

      if (setupStep == SetupSteps.DRIVER_CONFIG && "matterLogLevel" in msg.inputValues) {
        return await handleDriverConfigDataResponse(msg);
      }

      if (setupStep == SetupSteps.MATTER_SETUP && "pairingCode" in msg.inputValues) {
        return await handleMatterSetupDataResponse(msg);
      }

      if (setupStep == SetupSteps.MATTER_COMMISSIONING || setupStep == SetupSteps.MATTER_STRUCTURE_DEBUG_OUTPUT) {
        return new uc.SetupComplete();
      }

      if (setupStep == SetupSteps.CONFIGURATION_MODE && "action" in msg.inputValues) {
        return await handleConfigurationMode(msg);
      }

      log.error("No or invalid user response was received: %s", msg);
    } else if (msg instanceof uc.AbortDriverSetup) {
      log.info("Setup was aborted with code: %s", msg.error);
      setupStep = SetupSteps.INIT;
    }
  } catch (e) {
    log.error(e);
  }

  return new uc.SetupError();
};

export { driverSetupHandler };
