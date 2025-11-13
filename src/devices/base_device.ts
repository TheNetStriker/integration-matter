import * as uc from "@unfoldedcircle/integration-api";
import { BridgedDeviceBasicInformation } from "@matter/main/clusters";
import { Endpoint } from "@project-chip/matter.js/device";

import log from "../loggers.js";
import { driver } from "../globals.js";
import { MatterBridge } from "../matter/controller.js";
import { MatterHelpers } from "../matter/helpers.js";

export interface GetEntityAttributeOptions {
  initFromMatterCache: boolean;
  requestFromRemote: boolean;
  onlyReturnChangedAttributes: boolean;
}

export interface DeviceInfo {
  endpointProductName: string | undefined;
  endpointLabel: string | undefined;
  endpointSerialNumber: string | undefined;

  entityIdentifier: string;
  entityId: string;
  entityLabel: string;
}

interface AttributeListener {
  listener: (...args: any[]) => void;
  removeMethod: (listener: any) => void;
}

export abstract class BaseDevice {
  matterBridge: MatterBridge;
  endpoint: Endpoint;
  deviceInfo: DeviceInfo;

  entity: uc.Entity;
  entityAttributes: { [key: string]: string | number | boolean | string[] } = {};

  attributeListenersMap: Map<string, AttributeListener>;

  constructor(endpoint: Endpoint, matterBridge: MatterBridge, deviceInfo: DeviceInfo, entity: uc.Entity) {
    this.endpoint = endpoint;
    this.matterBridge = matterBridge;
    this.deviceInfo = deviceInfo;
    this.entity = entity;

    this.attributeListenersMap = new Map<string, AttributeListener>();
  }

  public abstract addAttributeListeners(): void;
  abstract getEntityAttributes(
    options: GetEntityAttributeOptions
  ): Promise<{ [key: string]: string | number | boolean | string[] }>;
  abstract hasAttribute(attribute: string): boolean;
  abstract entityCmdHandler(
    entity: uc.Entity,
    cmdId: string,
    params?: { [key: string]: string | number | boolean | string[] }
  ): ReturnType<uc.CommandHandler>;

  public static async initDeviceInfo(endpoint: Endpoint, matterBridge: MatterBridge): Promise<DeviceInfo> {
    const bridgedDeviceBasicInformationClient =
      endpoint.getClusterClient(BridgedDeviceBasicInformation.Complete) ??
      (() => {
        throw new Error("No BridgedDeviceBasicInformation.");
      })();

    const endpointProductName = await bridgedDeviceBasicInformationClient.getProductNameAttribute();
    const endpointLabel = await bridgedDeviceBasicInformationClient.getNodeLabelAttribute();
    const endpointSerialNumber = await bridgedDeviceBasicInformationClient.getSerialNumberAttribute();
    let entityIdentifier: string;
    let entityLabel: string;

    if (matterBridge.vendorName == "openHAB" && endpointProductName) {
      entityIdentifier = endpointProductName.replace(" ", "_");
    } else if (matterBridge.productName == "MatterHub" && endpointSerialNumber) {
      entityIdentifier = endpointSerialNumber.toString();
    } else {
      entityIdentifier = `${matterBridge.id}-${endpoint.number!.toString()}`;
    }

    const entityId = `${matterBridge.entityIdentifier}|${entityIdentifier}`;

    if (endpointLabel) {
      entityLabel = `${matterBridge.label}: ${endpointLabel}`;
    } else {
      entityLabel = `${matterBridge.label}: ${endpoint.number!}`;
    }

    return {
      endpointProductName: endpointProductName,
      endpointLabel: endpointLabel,
      endpointSerialNumber: endpointSerialNumber,
      entityIdentifier: entityIdentifier,
      entityId: entityId,
      entityLabel: entityLabel
    };
  }

  hasAttributeListeners() {
    return this.attributeListenersMap.size > 0;
  }

  private onMatterAttributeChanged = (entityAttribute: string, value: any) => {
    const matterToUcStateConverter = MatterHelpers.getMatterToUcStateConverter(
      this.entity.entity_type,
      entityAttribute,
      this.endpoint.deviceType
    );
    if (!matterToUcStateConverter) return;

    let attributes = matterToUcStateConverter(this.endpoint, value);

    log.debug(
      `${MatterHelpers.getReadableEntityAttributeName(entityAttribute, true)} update value ${value} on entity ${this.deviceInfo.entityId}.`
    );

    if (entityAttribute == "state" && value == false && this.hasAttribute(uc.LightAttributes.Brightness)) {
      attributes[uc.LightAttributes.Brightness] = 0;
      log.debug(`Light state change, setting brightness to 0 on entity ${this.deviceInfo.entityId}.`);
    }

    this.updateEntityAttributes(attributes);
  };

  addAttributeListener(entityAttribute: string) {
    let matterToUcStateConverter = MatterHelpers.getMatterToUcStateConverter(
      this.entity.entity_type,
      entityAttribute,
      this.endpoint.deviceType
    );
    let addMatterAttributeListener = MatterHelpers.getAddMatterAttributeListener(
      this.entity.entity_type,
      entityAttribute,
      this.endpoint
    );
    let removeMatterAttributeListener = MatterHelpers.getRemoveMatterAttributeListener(
      this.entity.entity_type,
      entityAttribute,
      this.endpoint
    );

    if (!matterToUcStateConverter || !addMatterAttributeListener || !removeMatterAttributeListener) {
      log.warn(`Could not add attribute listeners on entity ${this.deviceInfo.entityId}`);
      return;
    }

    let existingAttributeListener = this.attributeListenersMap.get(entityAttribute);

    if (existingAttributeListener) {
      existingAttributeListener.removeMethod(existingAttributeListener.listener);
      log.debug(`Existing attribute listener removed on entity id: ${this.deviceInfo.entityId}`);
    }

    const listener = (value: any) => this.onMatterAttributeChanged(entityAttribute, value);

    addMatterAttributeListener(listener);

    this.attributeListenersMap.set(entityAttribute, {
      listener: listener,
      removeMethod: removeMatterAttributeListener
    });
  }

  removeAttributeListeners() {
    if (!this.hasAttributeListeners()) return;

    log.debug(`removeAttributeListeners for entity id: ${this.deviceInfo.entityId}`);

    for (const [, attributeListener] of this.attributeListenersMap) {
      attributeListener.removeMethod(attributeListener.listener);
    }

    this.attributeListenersMap.clear();
  }

  protected async getEntityAttribute(
    options: GetEntityAttributeOptions,
    entityAttribute: string
  ): Promise<string | number | boolean | string[] | undefined> {
    let getMatterAttribute = MatterHelpers.getMatterAttribute(this.entity.entity_type, entityAttribute, this.endpoint);
    let getMatterAttributeFromCache = MatterHelpers.getMatterAttributeFromCache(
      this.entity.entity_type,
      entityAttribute,
      this.endpoint
    );

    let matterToUcStateConverter = MatterHelpers.getMatterToUcStateConverter(
      this.entity.entity_type,
      entityAttribute,
      this.endpoint.deviceType
    );

    if (!getMatterAttribute || !getMatterAttributeFromCache || !matterToUcStateConverter) return;

    let cachedValue = options.initFromMatterCache
      ? matterToUcStateConverter(this.endpoint, getMatterAttributeFromCache())[entityAttribute]
      : this.entityAttributes[entityAttribute];

    if (options.requestFromRemote) {
      let remoteValue = matterToUcStateConverter(this.endpoint, await getMatterAttribute(options.requestFromRemote))[
        entityAttribute
      ];
      let valueChanged = cachedValue != remoteValue;

      if (options.onlyReturnChangedAttributes && valueChanged) {
        log.debug(
          `${MatterHelpers.getReadableEntityAttributeName(entityAttribute, true)} value changed from ${cachedValue} to ${remoteValue} on entity ${this.deviceInfo.entityId}.`
        );
      } else if (options.onlyReturnChangedAttributes && !valueChanged) {
        log.debug(
          `${MatterHelpers.getReadableEntityAttributeName(entityAttribute, true)} value has not changed on entity ${this.deviceInfo.entityId}.`
        );
        return undefined;
      } else {
        log.debug(
          `Got remote ${MatterHelpers.getReadableEntityAttributeName(entityAttribute, false)} value ${remoteValue} on entity ${this.deviceInfo.entityId}.`
        );
      }

      return remoteValue;
    } else if (cachedValue != undefined) {
      log.debug(
        `Got cached ${MatterHelpers.getReadableEntityAttributeName(entityAttribute, false)} value ${cachedValue} on entity ${this.deviceInfo.entityId}.`
      );
      return cachedValue;
    }
  }

  async sendAttributes(options: GetEntityAttributeOptions) {
    let entityAttributes = await this.getEntityAttributes(options);

    if (Object.keys(entityAttributes).length) {
      this.updateEntityAttributes(entityAttributes);
    }
  }

  async getEntityStateAttributes(entityAttributes: string[], options: GetEntityAttributeOptions) {
    let attributes: { [key: string]: string | number | boolean | string[] } = {};

    for (let entityAttribute of entityAttributes) {
      if (this.hasAttribute(entityAttribute)) {
        let entityState = await this.getEntityAttribute(options, entityAttribute);

        if (entityState != undefined) {
          attributes[entityAttribute] = entityState;
        }
      }
    }

    return attributes;
  }

  updateEntityAttributes(attributes: { [key: string]: string | number | boolean | string[] }) {
    if (driver.updateEntityAttributes(this.deviceInfo.entityId, attributes as any)) {
      this.updateCachedEntityAttributes(attributes);
    }
  }

  updateCachedEntityAttributes(attributes: { [key: string]: string | number | boolean | string[] }) {
    for (const [key, value] of Object.entries(attributes)) {
      this.entityAttributes[key] = value;
    }
  }

  addAvailableEntity() {
    if (this.entity.attributes) {
      this.updateCachedEntityAttributes(this.entity.attributes);
    }

    driver.addAvailableEntity(this.entity);

    return true;
  }
}
