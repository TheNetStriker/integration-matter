import * as uc from "@unfoldedcircle/integration-api";
import { Endpoint } from "@matter/node";
import { OnOffClient } from "@matter/node/behaviors/on-off";

import log from "../loggers.js";
import { BaseDevice, DeviceInfo, GetEntityAttributeOptions } from "./base_device.js";
import { MatterDeviceType } from "./device_maps.js";
import { ClosedError } from "@matter/main";

export class SwitchDevice extends BaseDevice {
  addAttributeListeners() {
    if (this.hasAttributeListeners()) return;

    log.debug(`addAttributeListeners for entity id: ${this.deviceInfo.entityId}`);

    if (this.hasAttribute(uc.SwitchAttributes.State)) {
      this.addAttributeListener(uc.SwitchAttributes.State);
    }
  }

  static async initUcEntity(endpoint: Endpoint, deviceInfo: DeviceInfo): Promise<uc.Entity> {
    var switchFeatures: uc.SwitchFeatures[] = [];

    if (endpoint.behaviors.has(OnOffClient)) {
      switchFeatures.push(uc.SwitchFeatures.OnOff, uc.SwitchFeatures.Toggle);
    }

    // Read device type from Descriptor cluster state
    const { DescriptorClient } = await import("@matter/node/behaviors/descriptor");
    const descriptorState = endpoint.maybeStateOf(DescriptorClient);
    const deviceTypeValue = descriptorState?.deviceTypeList[0]?.deviceType ?? 0;

    var deviceClass =
      deviceTypeValue == MatterDeviceType.OnOffPlugInUnit
        ? uc.SwitchDeviceClasses.Outlet
        : uc.SwitchDeviceClasses.Switch;

    const entity = new uc.Switch(deviceInfo.entityId, deviceInfo.entityLabel!, {
      features: switchFeatures,
      deviceClass: deviceClass
    });

    return entity;
  }

  async getEntityAttributes(options: GetEntityAttributeOptions) {
    return this.getEntityStateAttributes([uc.SwitchAttributes.State], options);
  }

  hasAttribute(attribute: string): boolean {
    if (!this.entity.features) return false;

    switch (attribute) {
      case uc.SwitchAttributes.State:
        return this.entity.features.includes(uc.SwitchFeatures.OnOff);
    }

    return false;
  }

  /**
   * Matter switch command handler.
   *
   * Called by the integration-API if a command is sent to a configured entity.
   *
   * @param entity button entity
   * @param cmdId command
   * @param params optional command parameters
   * @return status of the command
   */
  entityCmdHandler = async (
    entity: uc.Entity,
    cmdId: string,
    params?: { [key: string]: string | number | boolean | string[] }
  ): ReturnType<uc.CommandHandler> => {
    log.debug("Got %s command request: %s params: %s", entity.id, cmdId, params);

    try {
      if (!this.endpoint.behaviors.has(OnOffClient)) {
        return uc.StatusCodes.NotFound;
      }

      switch (cmdId) {
        case uc.LightCommands.Toggle:
          await this.endpoint.commandsOf(OnOffClient).toggle();
          break;
        case uc.LightCommands.On:
          await this.endpoint.commandsOf(OnOffClient).on();
          break;
        case uc.LightCommands.Off:
          await this.endpoint.commandsOf(OnOffClient).off();
          break;
        default:
          return uc.StatusCodes.NotImplemented;
      }
    } catch (e) {
      log.error(e);

      if (e instanceof ClosedError) {
        log.error("entityCmdHandler ClosedError " + e.cause);
      }

      return uc.StatusCodes.ServiceUnavailable;
    }

    return uc.StatusCodes.Ok;
  };
}
