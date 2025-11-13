import * as uc from "@unfoldedcircle/integration-api";
import { WindowCovering } from "@matter/main/clusters";
import { Endpoint } from "@project-chip/matter.js/device";

import log from "../loggers.js";
import { BaseDevice, DeviceInfo, GetEntityAttributeOptions } from "./base_device.js";
import { MatterValueConverters } from "../matter/converters.js";

export class CoverDevice extends BaseDevice {
  addAttributeListeners() {
    if (this.hasAttributeListeners()) return;

    log.debug(`addAttributeListeners for entity id: ${this.deviceInfo.entityId}`);

    if (this.hasAttribute(uc.CoverAttributes.State)) {
      this.addAttributeListener(uc.CoverAttributes.State);
    }

    if (this.hasAttribute(uc.CoverAttributes.Position)) {
      this.addAttributeListener(uc.CoverAttributes.Position);
    }

    if (this.hasAttribute(uc.CoverAttributes.TiltPosition)) {
      this.addAttributeListener(uc.CoverAttributes.TiltPosition);
    }
  }

  static async initUcEntity(endpoint: Endpoint, deviceInfo: DeviceInfo): Promise<uc.Entity> {
    var coverFeatures: uc.CoverFeatures[] = [];

    const windowCoveringClient = endpoint.getClusterClient(WindowCovering.Complete);

    if (windowCoveringClient) {
      const windowCoveringFeatures = windowCoveringClient.getFeatureMapAttributeFromCache();

      coverFeatures.push(uc.CoverFeatures.Close, uc.CoverFeatures.Open, uc.CoverFeatures.Stop);

      if (windowCoveringFeatures?.positionAwareLift) {
        coverFeatures.push(uc.CoverFeatures.Position);
      }

      if (windowCoveringFeatures?.tilt) {
        coverFeatures.push(uc.CoverFeatures.Tilt, uc.CoverFeatures.TiltStop);
      }

      if (windowCoveringFeatures?.positionAwareTilt) {
        coverFeatures.push(uc.CoverFeatures.TiltPosition);
      }
    }

    const entity = new uc.Cover(deviceInfo.entityId, deviceInfo.entityLabel!, {
      features: coverFeatures
    });

    return entity;
  }

  async getEntityAttributes(options: GetEntityAttributeOptions) {
    let attributes: string[] = [uc.CoverAttributes.State];

    if (this.entity.features) {
      if (this.entity.features.includes(uc.CoverFeatures.Position)) {
        attributes.push(uc.CoverAttributes.Position);
      }
    }

    if (this.entity.features) {
      if (this.entity.features.includes(uc.CoverFeatures.TiltPosition)) {
        attributes.push(uc.CoverAttributes.TiltPosition);
      }
    }

    let entityAttributes = await this.getEntityStateAttributes(attributes, options);

    return entityAttributes;
  }

  hasAttribute(attribute: string): boolean {
    if (!this.entity.features) return false;

    switch (attribute) {
      case uc.CoverAttributes.State:
        return true;
      case uc.CoverAttributes.Position:
        return this.entity.features.includes(uc.CoverFeatures.Position);
      case uc.CoverAttributes.TiltPosition:
        return this.entity.features.includes(uc.CoverFeatures.TiltPosition);
    }

    return false;
  }

  /**
   * Matter cover command handler.
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
      const windowCoveringClient = this.endpoint.getClusterClient(WindowCovering.Complete);

      if (!windowCoveringClient) {
        return uc.StatusCodes.NotFound;
      }

      switch (cmdId) {
        case uc.CoverCommands.Close:
          await windowCoveringClient.downOrClose();
          break;
        case uc.CoverCommands.Open:
          await windowCoveringClient.upOrOpen();
          break;
        case uc.CoverCommands.Position:
          if (params?.position != undefined && typeof params?.position === "number") {
            await windowCoveringClient.goToLiftPercentage({
              liftPercent100thsValue: MatterValueConverters.ucCoverPositionToMatterWindowCoveringPosition(
                params.position
              )
            });
          }
          break;
        case uc.CoverCommands.Stop:
          await windowCoveringClient.stopMotion();
          break;
        case uc.CoverCommands.Tilt:
          if (params?.position && typeof params?.position === "number") {
            await windowCoveringClient.goToTiltPercentage({
              tiltPercent100thsValue: MatterValueConverters.ucCoverPositionToMatterWindowCoveringPosition(
                params.position
              )
            });
          }
          break;
        case uc.CoverCommands.TiltDown:
          await windowCoveringClient.goToTiltPercentage({ tiltPercent100thsValue: 0 });
          break;
        case uc.CoverCommands.TiltStop:
          await windowCoveringClient.stopMotion();
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
