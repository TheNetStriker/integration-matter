import { LightStates, SwitchStates } from "@unfoldedcircle/integration-api";
import { driverConfig, TemperatureUnit } from "../config.js";

export class MatterValueConverters {
  static ucPercentToMired(value: number) {
    // Begrenzen auf 0–100
    value = Math.min(100, Math.max(0, value));

    const minKelvin = 2000; // warm
    const maxKelvin = 6500; // kalt

    // Linear von 0–100 auf Kelvin umrechnen
    const kelvin = maxKelvin - (value / 100) * (maxKelvin - minKelvin);

    // Kelvin -> Mired
    return Math.round(1000000 / kelvin);
  }

  static matterMiredToPercent(mired: number | undefined): number | "UNKNOWN" {
    if (mired == undefined) return "UNKNOWN";

    const minKelvin = 2000; // warm
    const maxKelvin = 6500; // kalt

    // zurück zu Kelvin
    const kelvin = 1_000_000 / mired;

    // zurück zu Prozent
    let percent = ((maxKelvin - kelvin) / (maxKelvin - minKelvin)) * 100;

    // Begrenzen auf 0–100
    percent = Math.min(100, Math.max(0, percent));

    return Math.round(percent);
  }

  static ucHueToMatter(value: number) {
    return Math.round((value / 360) * 254);
  }

  static matterHueToUc(value: number | undefined) {
    return value == undefined ? LightStates.Unknown : Math.round((value / 254) * 360);
  }

  static ucSaturationToMatter(value: number) {
    return value - 1;
  }

  static matterSaturationToUc(value: number | undefined) {
    return value == undefined ? LightStates.Unknown : value + 1;
  }

  static ucLevelToMatter(value: number) {
    return value - 1;
  }

  static matterLevelToUc(value: number | null | undefined) {
    return value == null || value == undefined ? LightStates.Unknown : value + 1;
  }

  static matterLevelToUcSwitchState(value: number | null | undefined) {
    return value == null || value == undefined ? LightStates.Unknown : value > 0 ? SwitchStates.On : SwitchStates.Off;
  }

  static matterOnOffToUcSwitchState(value: boolean | undefined) {
    return value === true ? SwitchStates.On : value === false ? SwitchStates.Off : SwitchStates.Unknown;
  }

  static matterOnOffToUcLightState(value: boolean | undefined) {
    return value === true ? LightStates.On : value === false ? LightStates.Off : LightStates.Unknown;
  }

  static matterTemperatureToUc(value: any) {
    if (driverConfig.get().temperatureUnit == TemperatureUnit.Fahrenheit) {
      return value * 0.018 + 32;
    } else {
      return value * 0.01;
    }
  }

  static matterHumidityToUc(value: any) {
    return value * 0.01;
  }
}
