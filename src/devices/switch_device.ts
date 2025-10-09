import * as uc from "@unfoldedcircle/integration-api";
import { OnOff } from "@matter/main/clusters";

import log from "../loggers.js";
import { MatterValueConverters } from "../matter_value_converters.js";
import { BaseDevice, GetEntityAttributeOptions, MatterDeviceType } from "./base_device.js";

export class SwitchDevice extends BaseDevice {
  addAttributeListeners() {
    if (this.attributeListenersAdded) return;

    log.debug(`addAttributeListeners for entity id: ${this.deviceInfo.entityId}`);

    const onOffClient = this.endpoint.getClusterClient(OnOff.Complete);

    if (onOffClient) {
      let onOffListener = (value: boolean) => {
        this.updateEntityAttributes({
          [uc.SwitchAttributes.State]: MatterValueConverters.matterOnOffToUcSwitchState(value)
        });

        log.debug(`OnOff update value ${value} on entity ${this.deviceInfo.entityId}.`);
      };

      onOffClient.addOnOffAttributeListener(onOffListener);
      this.attributeListeners.push({
        listener: onOffListener,
        removeMethod: onOffClient.removeOnOffAttributeListener
      });
    }

    this.attributeListenersAdded = true;
  }

  async initUcEntity(): Promise<void> {
    var switchFeatures: uc.SwitchFeatures[] = [];

    if (this.endpoint.hasClusterClient(OnOff.Complete)) {
      switchFeatures.push(uc.SwitchFeatures.OnOff, uc.SwitchFeatures.Toggle);
    }

    var deviceClass =
      this.endpoint.deviceType.valueOf() == MatterDeviceType.OnOffPlugInUnit
        ? uc.SwitchDeviceClasses.Outlet
        : uc.SwitchDeviceClasses.Switch;

    this.entity = new uc.Switch(this.deviceInfo.entityId, this.deviceInfo.entityLabel!, {
      features: switchFeatures,
      deviceClass: deviceClass
    });

    this.entity.attributes = await this.getEntityAttributes({
      initFromMatterCache: true,
      requestFromRemote: false,
      onlyReturnChangedAttributes: false
    });

    this.entity.setCmdHandler(this.switchCmdHandler.bind(this));
  }

  protected async getEntityAttributes(options: GetEntityAttributeOptions) {
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
  async switchCmdHandler(
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
