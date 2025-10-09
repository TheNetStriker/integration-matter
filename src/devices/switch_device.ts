import * as uc from "@unfoldedcircle/integration-api";
import { OnOff } from "@matter/main/clusters";

import log from "../loggers.js";
import { MatterValueConverters } from "../matter_value_converters.js";
import { BaseDevice, DeviceInfo, GetEntityAttributeOptions, MatterDeviceType } from "./base_device.js";
import { Endpoint } from "@project-chip/matter.js/device";

export class SwitchDevice extends BaseDevice {
  addAttributeListeners() {
    if (this.attributeListenersAdded) return;

    log.debug(`addAttributeListeners for entity id: ${this.deviceInfo.entityId}`);

    const onOffClient = this.endpoint.getClusterClient(OnOff.Complete);

    if (onOffClient) {
      this.addAttributeListener(uc.SwitchAttributes.State);
    }

    this.attributeListenersAdded = true;
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
    let entityAttributes: { [key: string]: string | number | boolean } = {};

    let entityState = await this.getEntityAttribute(options, uc.SwitchAttributes.State);
    if (entityState != undefined) entityAttributes[uc.LightAttributes.Hue] = entityState;

    return entityAttributes;
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
  async entityCmdHandler(
    entity: uc.Entity,
    cmdId: string,
    params?: { [key: string]: string | number | boolean | string[] }
  ): ReturnType<uc.CommandHandler> {
    log.debug("Got %s command request: %s params: %s", entity.id, cmdId, params);

    if (!this.matterBridge.rootNode.isConnected) {
      return uc.StatusCodes.ServiceUnavailable;
    }

    const onOffClient = this.endpoint.getClusterClient(OnOff.Complete);

    if (!onOffClient) {
      return uc.StatusCodes.NotFound;
    }

    try {
      switch (cmdId) {
        case uc.LightCommands.Toggle:
          onOffClient.toggle();
          break;
        case uc.LightCommands.On:
          onOffClient.on();
          break;
        case uc.LightCommands.Off:
          onOffClient.off();
          break;
        default:
          return uc.StatusCodes.NotImplemented;
      }
    } catch (e) {
      log.error(e);
      return uc.StatusCodes.ServiceUnavailable;
    }

    return uc.StatusCodes.Ok;
  }
}
