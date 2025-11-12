import * as uc from "@unfoldedcircle/integration-api";
import { OnOff } from "@matter/main/clusters";
import { Endpoint } from "@project-chip/matter.js/device";

import log from "../loggers.js";
import { BaseDevice, DeviceInfo, GetEntityAttributeOptions } from "./base_device.js";
import { MatterDeviceType } from "./device_maps.js";

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

    if (endpoint.hasClusterClient(OnOff.Complete)) {
      switchFeatures.push(uc.SwitchFeatures.OnOff, uc.SwitchFeatures.Toggle);
    }

    var deviceClass =
      endpoint.deviceType.valueOf() == MatterDeviceType.OnOffPlugInUnit
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
      const onOffClient = this.endpoint.getClusterClient(OnOff.Complete);

      if (!onOffClient) {
        return uc.StatusCodes.NotFound;
      }

      switch (cmdId) {
        case uc.LightCommands.Toggle:
          await onOffClient.toggle();
          break;
        case uc.LightCommands.On:
          await onOffClient.on();
          break;
        case uc.LightCommands.Off:
          await onOffClient.off();
          break;
        default:
          return uc.StatusCodes.NotImplemented;
      }
    } catch (e) {
      log.error(e);
      return uc.StatusCodes.ServiceUnavailable;
    }

    return uc.StatusCodes.Ok;
  };
}
