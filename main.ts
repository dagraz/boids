// TODO:
//   * come up with more coherent names for ControlPanel stuff
//   * move bulk of ControlPanel logic to a separate file

import * as boids from "./boid.js";

export interface IndexableProperties {
    [index:string]: number | boolean | string | string[];
}


export interface ConfigurationFieldOptions {
    skip: boolean;
    updateFunction: () => void;
    isValid: (value: string) => boolean;
    errorMessage: string;
    inputTypeOverride: string;
    defaultArrayValue: string;
};

export const configurationFieldOptionsDefault: ConfigurationFieldOptions = {
    skip: false,
    updateFunction: () => {},
    isValid: (string) => {return true},
    errorMessage: "",
    inputTypeOverride: "",
    defaultArrayValue: ""
}

export type ConfigurationOptions<Properties> = {
    [Key in keyof Properties]?: Partial<ConfigurationFieldOptions>
};

function makePrimitiveInputNode(
        name: string,
        value: string | number | boolean,
        fieldOptions: ConfigurationFieldOptions,
        setValue: () => void) {
    const input = document.createElement('input') as HTMLInputElement;
    input.setAttribute('name', name as string);
    input.setAttribute('value', value.toString());

    if (fieldOptions.inputTypeOverride) {
        input.setAttribute('type', fieldOptions.inputTypeOverride);
    } else if (typeof value === "number") {
        input.setAttribute('type', 'number');
    } else if (typeof value === "boolean") {
        input.setAttribute('type', 'checkbox');
        input.toggleAttribute('checked', value as boolean);
    } else if (typeof value === "string") {
        // do nothing, use default input type.
    } else {
        let unsupportedInputValue: never = value;
    }

    input.addEventListener("change", () => {
        if (!fieldOptions.isValid(input.value)) {
            if (fieldOptions.errorMessage) {
                input.setCustomValidity(fieldOptions.errorMessage);
            } else {
                input.setCustomValidity("invalid input");
            }
            input.reportValidity();
        } else {
            input.setCustomValidity("")
            setValue();
            fieldOptions.updateFunction();
        }
    });

    return input;
}

function makeStringArrayInputNodes(
        arrayName: string,
        value: string[],
        fieldOptions: ConfigurationFieldOptions,
        controlPanelSection: HTMLElement) {
    const div = document.createElement('div') as HTMLDivElement;
    div.innerHTML = arrayName as string; 
    controlPanelSection.appendChild(div);

    function addField(i: number) {
        const label = document.createElement('label');
        label.innerHTML = arrayName;
        div.appendChild(label);
        const br = document.createElement('br');

        const input = makePrimitiveInputNode(arrayName, value[i], fieldOptions,
            () => {
                value[i] = input.value;
            });
        label.appendChild(input);

        const removeButton = document.createElement('input') as HTMLInputElement;
        removeButton.setAttribute('type', 'button');
        removeButton.setAttribute('value', 'x');
        removeButton.addEventListener('click', () => {
            value[i] = "";
            br.remove();
            label.remove();
            input.remove();
            removeButton.remove();
            fieldOptions.updateFunction();
        });
        div.appendChild(removeButton);
        div.appendChild(br);
    }

    const addButton = document.createElement('input') as HTMLInputElement;
    addButton.setAttribute('type', 'button');
    addButton.setAttribute('value', '+');
    addButton.addEventListener('click', () => {
        value.push(fieldOptions.defaultArrayValue);
        addField(value.length - 1);
        fieldOptions.updateFunction();
    });
    div.appendChild(addButton);
    div.appendChild(document.createElement('br'));
    
    for(let i = 0; i < value.length; i++) {
        addField(i);
    }
}


export function extendConfigurationControlPanel<Properties extends IndexableProperties>(
        sectionTitle: string,
        properties: Properties, 
        propertyOptions: ConfigurationOptions<Properties>,
        controlPanel: HTMLDivElement) {
    const controlPanelSection = document.createElement('p');
    controlPanelSection.innerHTML = sectionTitle;
    controlPanel.appendChild(controlPanelSection);
    controlPanelSection.appendChild(document.createElement('br'));

    for (const [kkey, value] of Object.entries(properties)) {
        const key = kkey as keyof Properties;
        
        const fieldOptions: ConfigurationFieldOptions = {
            ...configurationFieldOptionsDefault,
            ...propertyOptions[kkey]
        };
            

        if (fieldOptions.skip) {
            continue;
        }

        if (typeof value === "number" ||
            typeof value === "boolean" ||
            typeof value === "string") {

            const label = document.createElement('label');
            label.innerHTML = kkey;
            controlPanelSection.appendChild(label);
        
            const input = makePrimitiveInputNode(kkey, value, fieldOptions,
                () => {
                    if (typeof properties[key] === "number") {
                        properties[key] = parseFloat(input.value) as Properties[typeof key];
                    } else if (typeof properties[key] === "boolean") {
                        properties[key] = input.checked as Properties[typeof key];
                    } else if (typeof properties[key] === "string") {
                        properties[key] = input.value as Properties[typeof key];
                    }
                });

            label.appendChild(input);
            controlPanelSection.appendChild(document.createElement('br'));
        } else {
            // value: string[]
            makeStringArrayInputNodes(kkey, value, fieldOptions, controlPanelSection);
        }
    }
}

function updateConfigurationFromCgi<Properties extends IndexableProperties>(
        keyPrefix: string,
        properties: Properties, 
        propertyOptions: ConfigurationOptions<Properties>) {
    const arrayReset = new Set<string>();

    const params = new URLSearchParams(document.location.search);
    for (const [cgiKey, cgiValue] of params.entries()) {
        const segments = cgiKey.split('.');
        if (segments.length != 2 || segments[0] !== keyPrefix) {
            continue;
        }

        const key = segments[1] as keyof Properties;
        if (!Object.keys(properties).includes(key as string)) {
            continue;
        }

        const fieldOptions: ConfigurationFieldOptions = {
            ...configurationFieldOptionsDefault,
            ...propertyOptions[key]
        };

        if (fieldOptions.skip) {
            continue;
        }

        if (!fieldOptions.isValid(cgiValue)) {
            continue;
        }

        if (typeof properties[key] === "number") {
            properties[key] = parseFloat(cgiValue) as Properties[typeof key];
        } else if (typeof properties[key] === "boolean") {
            if (cgiValue === '') {
                properties[key] = true as Properties[typeof key];
            } else {
                properties[key] = (cgiValue === 't' || cgiValue === 'true') as Properties[typeof key];
            }
        } else if (typeof properties[key] === "string") {
            properties[key] = cgiValue as Properties[typeof key];
        } else if (properties[key] instanceof Array) {
            // If this is the first item we're seeing from an array, 
            // reset the array to clear out the default values.
            if (!arrayReset.has(key as string)) {
                // quietly amazed that this works.
                (properties[key] as string[]) = [];
                arrayReset.add(key as string);
            }
            (properties[key] as string[]).push(cgiValue);
        }

        fieldOptions.updateFunction();
    }
 }


function stringNumChecker(requireInt: boolean, min?: number, max?: number): (input:string) => boolean {
    return (input: string) => {
        const n = parseFloat(input);
        if (isNaN(n)) {
            return false;
        }

        if (requireInt && n !== Math.trunc(n)) {
            return false;
        }

        if (min !== undefined && n < min) {
            return false;
        }

        if (max !== undefined && n > max) {
            return false;
        }

        return true;
    }
}

const controlPanel = document.querySelector("[name=controlPanel]") as HTMLDivElement;

let canvas = document.getElementsByTagName("canvas")[0];
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;    

const worldProperties = Object.assign({} as IndexableProperties, boids.worldPropertiesDefault);
worldProperties.cohortColors = boids.worldPropertiesDefault.cohortColors.slice();


const worldPropertiesDefault = Object.assign({} as IndexableProperties, boids.worldPropertiesDefault);
worldPropertiesDefault.cohortColors = boids.worldPropertiesDefault.cohortColors.slice();

const boidProperties = Object.assign({} as IndexableProperties, boids.boidPropertiesDefault);
const boidPropertiesDefault = Object.assign({} as IndexableProperties, boids.boidPropertiesDefault);
const spaceBucketProperties = Object.assign({} as IndexableProperties, boids.spaceBucketPropertiesDefault);
const spaceBucketPropertiesDefault = Object.assign({} as IndexableProperties, boids.spaceBucketPropertiesDefault);

const world = new boids.World(
    canvas,
    worldProperties,
    boidProperties,
    spaceBucketProperties);

const worldPropertiesOptions: ConfigurationOptions<boids.WorldProperties> = {
    width: {skip: true},
    height: {skip: true},
    numBoids: {
        updateFunction: () => {world.updateNumBoids();},
        isValid: stringNumChecker(true, 0),
        errorMessage: "numBoids must be a non-negative integer"
    },
    continuousCohorts: {updateFunction: () => {world.updateCohorts();}},
    cohortColors: {
        inputTypeOverride: "color",
        isValid: (value: string) => { return CSS.supports("color", value)},
        updateFunction: () => {world.updateCohorts();},
        defaultArrayValue: "#000000",
    },
    backgroundColor: {
        inputTypeOverride: "color",
        isValid: (value: string) => { return CSS.supports("color", value)},
    },
    backgroundOpacity: {
        isValid: stringNumChecker(true, 0, 100),
        errorMessage: "backgroundOpacity must be an integer in the range of [0-100]"
    }
};
updateConfigurationFromCgi("wp", worldProperties, worldPropertiesOptions);
extendConfigurationControlPanel("World Properties", worldProperties,
    worldPropertiesOptions, controlPanel);

const spaceBucketPropertiesOptions: ConfigurationOptions<boids.SpaceBucketProperties> = {
    bucketSize: {
        updateFunction: () => {world.resetSpaceBuckets()},
        isValid: stringNumChecker(true, 1),
        errorMessage: "bucketSize must be a positive integer"
    }
};
updateConfigurationFromCgi("sp", spaceBucketProperties, spaceBucketPropertiesOptions);
extendConfigurationControlPanel("Space Bucket Properties", spaceBucketProperties,
    spaceBucketPropertiesOptions, controlPanel);

const boidPropertiesOptions: ConfigurationOptions<boids.BoidProperties> = {
    awarenessRadius: {updateFunction: () => {world.updateDerivedBoidProperties()}},
    maxAcceleration: {updateFunction: () => {world.updateDerivedBoidProperties()}},
};
updateConfigurationFromCgi("bp", boidProperties, boidPropertiesOptions);
extendConfigurationControlPanel("Boid Properties", boidProperties, boidPropertiesOptions, controlPanel);


function setCgiParams<Properties extends IndexableProperties>(
        prefix: string, 
        properties: Properties,
        defaultProperties: Properties,
        propertyOptions: ConfigurationOptions<Properties>,
        searchParams: URLSearchParams) {
    for(const [key, value] of Object.entries(properties)) {
        const fieldOptions: ConfigurationFieldOptions = {
            ...configurationFieldOptionsDefault,
            ...propertyOptions[key]
        };

        if (fieldOptions.skip) {
            continue;
        }

        if (typeof value === "number" ||
            typeof value === "boolean" ||
            typeof value === "string") {
            if (value != defaultProperties[key]) {
                searchParams.set(prefix + '.' + key, `${value}`);
            } 
        } else {
            // value: string[]
            if (value.toString() !== defaultProperties[key].toString()) {
                for(const v of value) {
                    if (fieldOptions.isValid(v)) {
                        searchParams.append(prefix + '.' + key, `${v}`);
                    }
                }
            }
        }
    }
}

function getUrl() {
    const url = new URL(window.location.href.split('?')[0]);
    const searchParams = url.searchParams;
    
    setCgiParams("wp", worldProperties, worldPropertiesDefault, worldPropertiesOptions, searchParams);
    setCgiParams("sp", spaceBucketProperties, spaceBucketPropertiesDefault, spaceBucketPropertiesOptions, searchParams);
    setCgiParams("bp", boidProperties, boidPropertiesDefault, boidPropertiesOptions, searchParams);

    const gottenUrl = document.getElementById("gottenUrl") as HTMLElement;
    gottenUrl.innerHTML = url.toString();
}

const getUrlButton = document.getElementById("getUrlButton") as HTMLElement;
getUrlButton.addEventListener("click", getUrl);


        
world.cycle();