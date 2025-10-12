import * as uc from "@unfoldedcircle/integration-api";

import log from "../loggers.js";
import { BaseDevice, DeviceInfo, GetEntityAttributeOptions, MatterDeviceType } from "./base_device.js";
import { Endpoint } from "@project-chip/matter.js/device";
import { MatterHelpers } from "../matter/helpers.js";
import { driverConfig, TemperatureUnit } from "../config.js";

export class SensorDevice extends BaseDevice {
  addAttributeListeners() {
    if (this.hasAttributeListeners()) return;

    log.debug(`addAttributeListeners for entity id: ${this.deviceInfo.entityId}`);

    this.addAttributeListener(uc.SensorAttributes.Value);
  }

  static async initUcEntity(endpoint: Endpoint, deviceInfo: DeviceInfo): Promise<uc.Entity> {
    var deviceClass = MatterHelpers.getUcSensorDeviceClass(endpoint.deviceType.valueOf());

    const entity = new uc.Sensor(deviceInfo.entityId, deviceInfo.entityLabel!, {
      deviceClass: deviceClass
    });

    return entity;
  }

  async getEntityAttributes(options: GetEntityAttributeOptions) {
    let entityAttributes = await this.getEntityStateAttributes([uc.SensorAttributes.Value], options);
    let endpointDeviceType = this.endpoint.deviceType.valueOf();

    if (endpointDeviceType == MatterDeviceType.TemperatureSensor) {
      switch (driverConfig.get().temperatureUnit) {
        case TemperatureUnit.Celcius:
          entityAttributes[uc.SensorAttributes.Unit] = "°C";
          break;
        case TemperatureUnit.Fahrenheit:
          entityAttributes[uc.SensorAttributes.Unit] = "°F";
      }
    } else if (endpointDeviceType == MatterDeviceType.HumiditySensor) {
      entityAttributes[uc.SensorAttributes.Unit] = "%";
    }

    entityAttributes[uc.SensorAttributes.State] = uc.SensorStates.On;

    return entityAttributes;
  }

  hasFeatureForAttribute(attribute: string): boolean {
    return attribute == uc.SensorAttributes.Value;
  }

  entityCmdHandler(
    entity: uc.Entity,
    cmdId: string,
    params?: { [key: string]: string | number | boolean | string[] }
  ): ReturnType<uc.CommandHandler> {
    throw new Error("Method not implemented.");
  }
}
