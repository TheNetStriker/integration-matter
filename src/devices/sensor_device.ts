import * as uc from "@unfoldedcircle/integration-api";
import { Endpoint } from "@matter/node";
import { DescriptorClient } from "@matter/node/behaviors/descriptor";

import log from "../loggers.js";
import { BaseDevice, DeviceInfo, GetEntityAttributeOptions } from "./base_device.js";
import { MatterHelpers } from "../matter/helpers.js";
import { driverConfig, TemperatureUnit } from "../config.js";
import { MatterDeviceType } from "./device_maps.js";
import { MatterBridge } from "../matter/controller.js";

export class SensorDevice extends BaseDevice {
  constructor(endpoint: Endpoint, matterBridge: MatterBridge, deviceInfo: DeviceInfo, entity: uc.Entity) {
    super(endpoint, matterBridge, deviceInfo, entity);
  }

  static async initUcEntity(endpoint: Endpoint, deviceInfo: DeviceInfo): Promise<uc.Entity> {
    const descriptorState = endpoint.maybeStateOf(DescriptorClient);
    const deviceTypeValue = (descriptorState?.deviceTypeList[0]?.deviceType ?? 0) as number;
    const ucDeviceClass = MatterHelpers.getUcSensorDeviceClass(deviceTypeValue);

    const entity = new uc.Sensor(deviceInfo.entityId, deviceInfo.entityLabel!, {
      deviceClass: ucDeviceClass
    });

    return entity;
  }

  addAttributeListeners() {
    if (this.hasAttributeListeners()) return;

    log.debug(`addAttributeListeners for entity id: ${this.deviceInfo.entityId}`);

    this.addAttributeListener(uc.SensorAttributes.Value);
  }

  async getEntityAttributes(options: GetEntityAttributeOptions) {
    let entityAttributes = await this.getEntityStateAttributes([uc.SensorAttributes.Value], options);

    if (this.endpointDeviceType == MatterDeviceType.TemperatureSensor) {
      switch (driverConfig.get().temperatureUnit) {
        case TemperatureUnit.Celcius:
          entityAttributes[uc.SensorAttributes.Unit] = "°C";
          break;
        case TemperatureUnit.Fahrenheit:
          entityAttributes[uc.SensorAttributes.Unit] = "°F";
      }
    } else if (this.endpointDeviceType == MatterDeviceType.HumiditySensor) {
      entityAttributes[uc.SensorAttributes.Unit] = "%";
    }

    entityAttributes[uc.SensorAttributes.State] = uc.SensorStates.On;

    return entityAttributes;
  }

  hasAttribute(attribute: string) {
    switch (attribute) {
      case uc.SensorAttributes.Value:
        return true;
    }

    return false;
  }

  entityCmdHandler = async (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _entity: uc.Entity,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _cmdId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _params?: { [key: string]: string | number | boolean | string[] }
  ): ReturnType<uc.CommandHandler> => {
    log.debug("Sensor does not support commands");
    return uc.StatusCodes.NotImplemented;
  };
}
