import * as boids from "./boid.js";

let canvas = document.getElementsByTagName("canvas")[0];
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;    


const world = new boids.World(
    canvas,
    boids.worldPropertiesDefault,
    boids.boidPropertiesDefault,
    boids.spaceBucketPropertiesDefault);

export interface ControlPanelFieldOptions {
    skip: boolean;
    updateFunction: () => void;
    isValid: (value: string) => boolean;
    errorMessage: string;
    inputTypeOverride: string;
    defaultArrayValue: string;
};

export const controlPanelFieldOptionsDefault: ControlPanelFieldOptions = {
    skip: false,
    updateFunction: () => {},
    isValid: (string) => {return true},
    errorMessage: "",
    inputTypeOverride: "",
    defaultArrayValue: ""
}

export type ControlPanelOptions<Properties> = {
    [Key in keyof Properties]?: Partial<ControlPanelFieldOptions>
};

function makePrimitiveInputNode(
        name: string,
        value: string | number | boolean,
        fieldOptions: ControlPanelFieldOptions,
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
        fieldOptions: ControlPanelFieldOptions,
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


export function extendControlPanel<Properties extends boids.IndexableProperties>(
        sectionTitle: string,
        properties: Properties, 
        propertyOptions: ControlPanelOptions<Properties>,
        controlPanel: HTMLDivElement) {
    const controlPanelSection = document.createElement('p');
    controlPanelSection.innerHTML = sectionTitle;
    controlPanel.appendChild(controlPanelSection);
    controlPanelSection.appendChild(document.createElement('br'));

    for (const [kkey, value] of Object.entries(properties)) {
        const key = kkey as keyof Properties;
        
        const fieldOptions: ControlPanelFieldOptions = {
            ...controlPanelFieldOptionsDefault,
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

function updatePropertiesFromCgi<Properties extends boids.IndexableProperties>(
        keyPrefix: string,
        properties: Properties, 
        propertyOptions: ControlPanelOptions<Properties>) {
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

        const fieldOptions: ControlPanelFieldOptions = {
            ...controlPanelFieldOptionsDefault,
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


const controlPanel = document.querySelector("[name=controlPanel]") as HTMLDivElement;

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

const worldPropertiesOptions: ControlPanelOptions<boids.WorldProperties> = {
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
updatePropertiesFromCgi("wp", world.worldProperties, worldPropertiesOptions);
extendControlPanel("World Properties", world.worldProperties,
    worldPropertiesOptions, controlPanel);

const spaceBucketPropertiesOptions: ControlPanelOptions<boids.SpaceBucketProperties> = {
    bucketSize: {
        updateFunction: () => {world.resetSpaceBuckets()},
        isValid: stringNumChecker(true, 1),
        errorMessage: "bucketSize must be a positive integer"
    }
};
updatePropertiesFromCgi("sp", world.spaceBucketProperties, spaceBucketPropertiesOptions);
extendControlPanel("Space Bucket Properties", world.spaceBucketProperties,
    spaceBucketPropertiesOptions, controlPanel);

const boidPropertiesOptions: ControlPanelOptions<boids.BoidProperties> = {
    awarenessRadius: {updateFunction: () => {world.updateDerivedBoidProperties()}},
    maxAcceleration: {updateFunction: () => {world.updateDerivedBoidProperties()}},
};
updatePropertiesFromCgi("bp", world.boidProperties, boidPropertiesOptions);
extendControlPanel("Boid Properties", world.boidProperties, boidPropertiesOptions, controlPanel);


function setCgiParams<Properties extends boids.IndexableProperties>(
        prefix: string, 
        properties: Properties,
        defaultProperties: Properties,
        propertyOptions: ControlPanelOptions<Properties>,
        searchParams: URLSearchParams) {
    for(const [key, value] of Object.entries(properties)) {
        const fieldOptions: ControlPanelFieldOptions = {
            ...controlPanelFieldOptionsDefault,
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
    
    setCgiParams("wp", world.worldProperties, boids.worldPropertiesDefault, worldPropertiesOptions, searchParams);
    setCgiParams("sp", world.spaceBucketProperties, boids.spaceBucketPropertiesDefault, spaceBucketPropertiesOptions, searchParams);
    setCgiParams("bp", world.boidProperties, boids.boidPropertiesDefault, boidPropertiesOptions, searchParams);

    const gottenUrl = document.getElementById("gottenUrl") as HTMLElement;
    gottenUrl.innerHTML = url.toString();
}

const getUrlButton = document.getElementById("getUrlButton") as HTMLElement;
getUrlButton.addEventListener("click", getUrl);


        
world.cycle();