// DeviceClassMap.ts
import type { BaseDevice } from "./base_device.js";

export enum MatterDeviceType {
  PowerSource = 17,
  BridgedNode = 19,
  ElectricalSensor = 1296,
  OnOffLight = 256,
  DimmableLight = 257,
  ColorTemperatureLight = 268,
  ExtendedColorLight = 269,
  OnOffPlugInUnit = 266,
  DimmablePlugInUnit = 267,
  MountedOnOffControl = 271,
  MountedDimmableLoadControl = 272,
  OnOffLightSwitch = 259,
  DimmerSwitch = 260,
  ColorDimmerSwitch = 261,
  GenericSwitch = 15,
  ContactSensor = 21,
  LightSensor = 262,
  OccupancySensor = 263,
  TemperatureSensor = 770,
  HumiditySensor = 775,
  OnOffSensor = 2128,
  AirQualitySensor = 44,
  WaterFreezeDetector = 65,
  WaterLeakDetector = 67,
  RainSensor = 68,
  DoorLock = 10,
  WindowCovering = 514,
  Thermostat = 769,
  Fan = 43,
  AirPurifier = 45,
  RoboticVacuumCleaner = 116,
  RoomAirConditioner = 114,
  SolarPower = 23,
  BatteryStorage = 24,
  ThreadBorderRouter = 145
}

type DeviceClassConstructor = {
  new (endpoint: any, matterBridge: any, deviceInfo: any, entity: any): BaseDevice;
  initUcEntity(endpoint: any, deviceInfo: any): Promise<any>;
};

export async function getDeviceClass(type: MatterDeviceType): Promise<DeviceClassConstructor | undefined> {
  switch (type) {
    case MatterDeviceType.OnOffLight:
    case MatterDeviceType.ExtendedColorLight:
    case MatterDeviceType.OnOffLightSwitch:
    case MatterDeviceType.ColorTemperatureLight:
    case MatterDeviceType.DimmableLight:
      return (await import("./light_device.js")).LightDevice;

    case MatterDeviceType.GenericSwitch:
    case MatterDeviceType.OnOffPlugInUnit:
      return (await import("./switch_device.js")).SwitchDevice;

    case MatterDeviceType.TemperatureSensor:
    case MatterDeviceType.HumiditySensor:
      return (await import("./sensor_device.js")).SensorDevice;

    case MatterDeviceType.WindowCovering:
      return (await import("./cover_device.js")).CoverDevice;

    default:
      return undefined;
  }
}
