import {
  CoverAttributes,
  CoverStates,
  LightAttributes,
  LightStates,
  SensorAttributes,
  SwitchAttributes,
  SwitchStates
} from "@unfoldedcircle/integration-api";
import { driverConfig, TemperatureUnit } from "../config.js";
import { Endpoint } from "@project-chip/matter.js/device";
import { WindowCovering } from "@matter/main/clusters";
import { MatterHelpers } from "./helpers.js";
import log from "../loggers.js";

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

  static matterMiredToPercent(
    endpoint: Endpoint,
    mired: number | undefined
  ): { [key: string]: string | number | boolean } {
    if (mired == undefined)
      return {
        [LightAttributes.ColorTemperature]: LightStates.Unknown
      };

    const minKelvin = 2000; // warm
    const maxKelvin = 6500; // kalt

    // zurück zu Kelvin
    const kelvin = 1_000_000 / mired;

    // zurück zu Prozent
    let percent = ((maxKelvin - kelvin) / (maxKelvin - minKelvin)) * 100;

    // Begrenzen auf 0–100
    percent = Math.min(100, Math.max(0, percent));

    return {
      [LightAttributes.ColorTemperature]: Math.round(percent)
    };
  }

  static ucHueToMatter(value: number) {
    return Math.round((value / 360) * 254);
  }

  static matterHueToUc(endpoint: Endpoint, value: number | undefined): { [key: string]: string | number | boolean } {
    return {
      [LightAttributes.Hue]: value == undefined ? LightStates.Unknown : Math.round((value / 254) * 360)
    };
  }

  static ucSaturationToMatter(value: number) {
    return value - 1;
  }

  static matterSaturationToUc(
    endpoint: Endpoint,
    value: number | undefined
  ): { [key: string]: string | number | boolean } {
    return {
      [LightAttributes.Saturation]: value == undefined ? LightStates.Unknown : value + 1
    };
  }

  static ucLevelToMatter(value: number) {
    return value - 1;
  }

  static matterLevelToUc(
    endpoint: Endpoint,
    value: number | null | undefined
  ): { [key: string]: string | number | boolean } {
    return {
      [LightAttributes.Brightness]: value == null || value == undefined ? LightStates.Unknown : value + 1
    };
  }

  static matterLevelToUcSwitchState(
    endpoint: Endpoint,
    value: number | null | undefined
  ): { [key: string]: string | number | boolean } {
    return {
      [SwitchAttributes.State]:
        value == null || value == undefined ? SwitchStates.Unknown : value > 0 ? SwitchStates.On : SwitchStates.Off
    };
  }

  static matterOnOffToUcSwitchState(
    endpoint: Endpoint,
    value: boolean | undefined
  ): { [key: string]: string | number | boolean } {
    return {
      [SwitchAttributes.State]:
        value === true ? SwitchStates.On : value === false ? SwitchStates.Off : SwitchStates.Unknown
    };
  }

  static matterOnOffToUcLightState(
    endpoint: Endpoint,
    value: boolean | undefined
  ): { [key: string]: string | number | boolean } {
    return {
      [LightAttributes.State]: value === true ? LightStates.On : value === false ? LightStates.Off : LightStates.Unknown
    };
  }

  static matterTemperatureToUc(endpoint: Endpoint, value: any): { [key: string]: string | number | boolean } {
    if (driverConfig.get().temperatureUnit == TemperatureUnit.Fahrenheit) {
      return { [SensorAttributes.Value]: value * 0.018 + 32 };
    } else {
      return { [SensorAttributes.Value]: value * 0.01 };
    }
  }

  static matterHumidityToUc(endpoint: Endpoint, value: any): { [key: string]: string | number | boolean } {
    return { [SensorAttributes.Value]: value * 0.01 };
  }

  private static matterWindowCoveringPositionsToUcCoverState(
    currentPosition: number | null | undefined,
    targetPosition: number | null | undefined
  ) {
    var coverState = CoverStates.Unknown;

    if (MatterHelpers.isNumber(currentPosition) && MatterHelpers.isNumber(targetPosition)) {
      log.debug(
        "Updating Matter window covering state: currentPosition: %s targetPosition: %s",
        currentPosition,
        targetPosition
      );

      if (currentPosition < targetPosition) {
        coverState = CoverStates.Opening;
      } else if (currentPosition > targetPosition) {
        coverState = CoverStates.Closing;
      } else if (currentPosition == targetPosition && currentPosition == 100) {
        coverState = CoverStates.Closed;
      } else {
        coverState = CoverStates.Open;
      }
    }

    return coverState;
  }

  static matterWindowCoveringToUcCoverState(
    endpoint: Endpoint,
    targetPosition: number | undefined
  ): { [key: string]: string | number | boolean } {
    var coverState = CoverStates.Unknown;
    const windowCoveringClient = endpoint.getClusterClient(WindowCovering.Complete);
    const coverPercentInverted = driverConfig.get().coverPercentInverted;

    if (MatterHelpers.isNumber(targetPosition) && coverPercentInverted) {
      targetPosition = 10000 - targetPosition;
    }

    if (windowCoveringClient) {
      let currentPosition = windowCoveringClient.getCurrentPositionLiftPercent100thsAttributeFromCache();

      if (MatterHelpers.isNumber(currentPosition) && coverPercentInverted) {
        currentPosition = 10000 - currentPosition;
      }

      coverState = MatterValueConverters.matterWindowCoveringPositionsToUcCoverState(currentPosition, targetPosition);
    }

    return { [CoverAttributes.State]: coverState };
  }

  static matterWindowCoveringCurrentPositionToUcCoverPosition(
    endpoint: Endpoint,
    currentPosition: number | undefined
  ): { [key: string]: string | number | boolean } {
    let attributes: { [key: string]: string | number | boolean } = {};
    const coverPercentInverted = driverConfig.get().coverPercentInverted;

    if (MatterHelpers.isNumber(currentPosition)) {
      if (coverPercentInverted) {
        currentPosition = 10000 - currentPosition;
      }

      attributes[CoverAttributes.Position] = currentPosition * 0.01;
    }

    const windowCoveringClient = endpoint.getClusterClient(WindowCovering.Complete);

    if (windowCoveringClient) {
      let targetPosition = windowCoveringClient.getTargetPositionLiftPercent100thsAttributeFromCache();

      if (MatterHelpers.isNumber(targetPosition) && coverPercentInverted) {
        targetPosition = 10000 - targetPosition;
      }

      attributes[CoverAttributes.State] = MatterValueConverters.matterWindowCoveringPositionsToUcCoverState(
        currentPosition,
        targetPosition
      );
    }

    return attributes;
  }

  static matterWindowCoveringCurrentPositionTiltToUcCoverTiltPosition(
    endpoint: Endpoint,
    currentTiltPosition: number | undefined
  ): { [key: string]: string | number | boolean } {
    if (MatterHelpers.isNumber(currentTiltPosition)) {
      return { [CoverAttributes.TiltPosition]: currentTiltPosition * 0.01 };
    }
    return {};
  }

  static ucCoverPositionToMatterWindowCoveringPosition(value: number) {
    return value * 100;
  }
}
