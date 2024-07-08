// TODO:
//   * Config option for two-column vs full-bleed
//   * config panel: 
//     *in fullscreen mode on mobile, cohort color text is small
//     * make control panel more legible
//     * figure out how to make the generated URL wrap or be in a scrolling box or something
//   * file level comments


import * as boids from "./boid.js";
import * as config from "./config_manager.js";


function resizeCanvas(canvas: HTMLCanvasElement) {
    /*
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;        
    */
    canvas.width = 800;
    canvas.height = 800;
}

const canvas = document.getElementsByTagName("canvas")[0];
resizeCanvas(canvas);

const worldProperties = Object.assign({} as config.IndexableProperties, boids.worldPropertiesDefault);
worldProperties.cohortColors = boids.worldPropertiesDefault.cohortColors.slice();


const worldPropertiesDefault = Object.assign({} as config.IndexableProperties, boids.worldPropertiesDefault);
worldPropertiesDefault.cohortColors = boids.worldPropertiesDefault.cohortColors.slice();

const boidProperties = Object.assign({} as config.IndexableProperties, boids.boidPropertiesDefault);
const boidPropertiesDefault = Object.assign({} as config.IndexableProperties, boids.boidPropertiesDefault);
const spaceBucketProperties = Object.assign({} as config.IndexableProperties, boids.spaceBucketPropertiesDefault);
const spaceBucketPropertiesDefault = Object.assign({} as config.IndexableProperties, boids.spaceBucketPropertiesDefault);

const world = new boids.World(
    canvas,
    worldProperties,
    boidProperties,
    spaceBucketProperties);


const controlPanel = document.querySelector("[name=controlPanel]") as HTMLDivElement;
const worldPropertiesOptions: config.ConfigurationOptions<boids.WorldProperties> = {
    numBoids: {
        updateFunction: () => {world.updateNumBoids();},
        isValid: config.stringNumChecker(true, 0),
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
        isValid: config.stringNumChecker(true, 0, 100),
        errorMessage: "backgroundOpacity must be an integer in the range of [0-100]"
    }
};
config.updateConfigurationFromCgi("wp", worldProperties, worldPropertiesOptions);
config.extendConfigurationControlPanel("World Properties", worldProperties,
    worldPropertiesOptions, controlPanel);

const spaceBucketPropertiesOptions: config.ConfigurationOptions<boids.SpaceBucketProperties> = {
    bucketSize: {
        updateFunction: () => {world.resetSpaceBuckets()},
        isValid: config.stringNumChecker(true, 1),
        errorMessage: "bucketSize must be a positive integer"
    }
};
config.updateConfigurationFromCgi("sp", spaceBucketProperties, spaceBucketPropertiesOptions);
config.extendConfigurationControlPanel("Space Bucket Properties", spaceBucketProperties,
    spaceBucketPropertiesOptions, controlPanel);

const boidPropertiesOptions: config.ConfigurationOptions<boids.BoidProperties> = {
    awarenessRadius: {updateFunction: () => {world.updateDerivedBoidProperties()}},
    maxAcceleration: {updateFunction: () => {world.updateDerivedBoidProperties()}},
};
config.updateConfigurationFromCgi("bp", boidProperties, boidPropertiesOptions);
config.extendConfigurationControlPanel("Boid Properties", boidProperties, boidPropertiesOptions, controlPanel);


function getUrl() {
    const url = new URL(window.location.href.split('?')[0]);
    const searchParams = url.searchParams;
    
    config.setCgiParams("wp", worldProperties, worldPropertiesDefault, worldPropertiesOptions, searchParams);
    config.setCgiParams("sp", spaceBucketProperties, spaceBucketPropertiesDefault, spaceBucketPropertiesOptions, searchParams);
    config.setCgiParams("bp", boidProperties, boidPropertiesDefault, boidPropertiesOptions, searchParams);

    const gottenUrl = document.getElementById("gottenUrl") as HTMLElement;
    gottenUrl.innerHTML = url.toString();
}

const getUrlButton = document.getElementById("getUrlButton") as HTMLElement;
getUrlButton.addEventListener("click", getUrl);

window.onresize = () => {
    resizeCanvas(canvas);
    world.resetCanvas();
};


world.cycle(performance.now());