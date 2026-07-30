import * as uc from "@unfoldedcircle/integration-api";
import { Endpoint } from "@matter/node";

import log from "../loggers.js";
import { BaseDevice, DeviceInfo, GetEntityAttributeOptions } from "./base_device.js";
import { MatterHelpers } from "../matter/helpers.js";
import { driverConfig, TemperatureUnit } from "../config.js";
import { MatterDeviceType } from "./device_maps.js";

export class SensorDevice extends BaseDevice {
  addAttributeListeners() {
    if (this.hasAttributeListeners()) return;

    log.debug(`addAttributeListeners for entity id: ${this.deviceInfo.entityId}`);

    this.addAttributeListener(uc.SensorAttributes.Value);
  }

  static async initUcEntity(endpoint: Endpoint, deviceInfo: DeviceInfo): Promise<uc.Entity> {
    const { DescriptorClient } = await import("@matter/node/behaviors/descriptor");
    const descriptorState = endpoint.maybeStateOf(DescriptorClient);
    const deviceTypeValue = (descriptorState?.deviceTypeList[0]?.deviceType ?? 0) as number;
    const ucDeviceClass = MatterHelpers.getUcSensorDeviceClass(deviceTypeValue);

    const entity = new uc.Sensor(deviceInfo.entityId, deviceInfo.entityLabel!, {
      deviceClass: ucDeviceClass
    });

    return entity;
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

  hasAttribute(attribute: string): boolean {
    return attribute == uc.SensorAttributes.Value;
  }

  entityCmdHandler(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    entity: uc.Entity,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cmdId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params?: { [key: string]: string | number | boolean | string[] }
  ): ReturnType<uc.CommandHandler> {
    throw new Error("Method not implemented.");
  }
}
