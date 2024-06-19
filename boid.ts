// taking inspiration from: 
//  * https://dl.acm.org/doi/10.1145/280811.281008
//  * https://vanhunteradams.com/Pico/Animal_Movement/Boids-algorithm.html
//
// todo: 
//  * configuration changes
//    * legibility
//      * make control panel more legible
//      * figure out how to make the generated URL wrap or be in a scrolling box or something
//    * allow for per-field data validation and conversion (e.g. float vs int, positive values, valid colors, etc)
//    * use color picker for user set colors
//  * configuration / property management (on-page control-panel, cgi parsing, url generation) 
//    feels like it could be cleaned up and wrapped into a separate library.
//  * 3d!


// used for runtime property changes
interface IndexableProperties {
    [index:string]: number | boolean | string | string[];
}

interface CohortProperties {
    color: string;
    cohort: number;
    cohortSeed: number;
}

interface WorldProperties extends IndexableProperties {
    numBoids: number;
    continuousCohorts: boolean;
    homogenousCohorts: boolean;
    cohortColors: string[];
    gravity: number;
    width: number;
    height: number;
    circularBorder: boolean;
    backgroundColor: string;
    backgroundOpacity: string;
}

const WORLD_PROPERTIES_DEFAULT: WorldProperties = {
    numBoids: 500,
    continuousCohorts: false,
    homogenousCohorts: true,
    cohortColors: ["#ff0000", "#0000ff"],
    gravity: 0,
    width: -1,
    height: -1,
    circularBorder: false,
    backgroundColor: "#ffffff",
    backgroundOpacity: "10"
}


interface SpaceBucketProperties extends IndexableProperties {
    bucketSize: number;
}

const SPACE_BUCKET_PROPERTIES_DEFAULT: SpaceBucketProperties = {
    bucketSize: 25,
}

interface BoidProperties extends IndexableProperties {
    // Global parameters for boid behavior
    minSpeed: number;
    maxSpeed: number;
    maxAcceleration: number;

    awarenessRadius: number;

    // If we want to experiement with Boids having a blind spot behind them
    // awarenessField: number;

    separation: number;
    cohesion: number;
    alignment: number;
    linearDrag: number;

    // Flee or chase the mouse pointer.  
    mouseAvoidance: number;
    edgeAvoidance: number;

    inverseSquareAvoidance: boolean;
};

const BOID_PROPERTIES_DEFAULT: BoidProperties = {
    minSpeed: 0.75,
    maxSpeed: 2,
    maxAcceleration: 0.2,
    awarenessRadius: 50,
    separation: 10,
    cohesion: 0.0025,
    alignment: 0.025,
    linearDrag: 0.0025,
    mouseAvoidance: 50,
    edgeAvoidance: 5,
    inverseSquareAvoidance: true,
};

interface DerivedBoidProperties {
    maxAccelerationSq: number;
    awarenessRadiusSq: number;
}

const DERIVED_BOID_PROPERTIES_DEFAULT: DerivedBoidProperties = {
    maxAccelerationSq: square(BOID_PROPERTIES_DEFAULT.maxAcceleration),
    awarenessRadiusSq: square(BOID_PROPERTIES_DEFAULT.awarenessRadius),
};

function square(x: number): number {
    return x * x;
}

function boidDistanceSq(boidA: Boid, boidB: Boid): number {
    return square(boidA.x - boidB.x) + square(boidA.y - boidB.y);
}

function boidDistance(boidA: Boid, boidB: Boid): number {
    return Math.sqrt(boidDistanceSq(boidA, boidB));
}

class Boid {
    constructor(public x: number, public y: number, public speed: number, direction: number, 
            boidProperties: BoidProperties, derivedBoidProperties: DerivedBoidProperties,
            worldProperties: WorldProperties, cohortProperties: CohortProperties) {
        this.vx = speed * Math.cos(direction);
        this.vy = speed * Math.sin(direction);
        this.deltaVx = 0;
        this.deltaVy = 0;

        this.cohortProperties = cohortProperties;
        this.worldProperties = worldProperties;
        this.boidProperties = boidProperties;
        this.derivedBoidProperties = derivedBoidProperties;
    }

    vx: number;
    vy: number;
    deltaVx: number;
    deltaVy: number;

    cohortProperties: CohortProperties;
    worldProperties: WorldProperties;
    boidProperties: BoidProperties;
    derivedBoidProperties: DerivedBoidProperties;

    public draw(context: CanvasRenderingContext2D) {
        // turns out save/restore/rotate/translate are a little pricey for how lightly this uses them.
        // doing the equiv work by hand shaves off a non-trivial hunk of cpu time.

        const cos = this.speed > 0 ? this.vx / this.speed : 1;
        const sin = this.speed > 0 ? this.vy / this.speed : 0;

        context.beginPath();
        context.moveTo(Math.floor(this.x + 7 * cos), Math.floor(this.y + 7 * sin));
        context.lineTo(Math.floor(this.x + -3 * sin), Math.floor(this.y + 3 * cos));
        context.lineTo(Math.floor(this.x + 3 * sin), Math.floor(this.y + -3 * cos));
        context.closePath();

        context.fillStyle = this.cohortProperties.color;
        context.fill();
    }


    edgeAvoidance(edgeDistance: number): number {
        if (edgeDistance <= 1) {
            return this.boidProperties.edgeAvoidance;
        } else {
            if (this.boidProperties.inverseSquareAvoidance) {
                return this.boidProperties.edgeAvoidance / (edgeDistance * edgeDistance);
            } else {
                return this.boidProperties.edgeAvoidance / edgeDistance;
            }
        }
    }

    updateAcceleration(nearBoids: [boid: Boid, distanceSq: number][], mousePosition: {x: number, y: number} | null) {
        this.deltaVx = 0;
        this.deltaVy = 0;

        // gravity
        if (this.worldProperties.gravity != 0) {
            this.deltaVy += this.worldProperties.gravity;
        }

        if (this.boidProperties.linearDrag > 0) {
            // while we're here and already have the speed calculated
            this.deltaVx -= this.vx * this.boidProperties.linearDrag;
            this.deltaVy -= this.vy * this.boidProperties.linearDrag;
        }

        // avoid edges
        if (this.worldProperties.circularBorder) {
            const centerWidth = 0.5 * this.worldProperties.width;
            const centerHeight = 0.5 * this.worldProperties.height;
            const distanceFromCenter = Math.sqrt(
                square(this.x - centerWidth) + square(this.y - centerHeight));
                
            const distanceFromEdge = 0.5 * Math.min(this.worldProperties.width, this.worldProperties.height) - 
                distanceFromCenter;
            const edgeAvoidanceScale = this.edgeAvoidance(distanceFromEdge) / distanceFromCenter;
            this.deltaVx += edgeAvoidanceScale * (centerWidth - this.x);
            this.deltaVy += edgeAvoidanceScale * (centerHeight - this.y);
        } else {
            // rectangular border
            this.deltaVx += this.edgeAvoidance(this.x);
            this.deltaVx -= this.edgeAvoidance(this.worldProperties.width - this.x);
            this.deltaVy += this.edgeAvoidance(this.y);
            this.deltaVy -= this.edgeAvoidance(this.worldProperties.height - this.y);
        }

        let sumX = 0;
        let sumY = 0;
        let sumVx = 0;
        let sumVy = 0;
        let numBoids = 0;
        
        for (const [otherBoid, distanceSq] of nearBoids) {
            // Boids will only cohere and align with members of the same cohort
            if (this.worldProperties.continuousCohorts) {
                let degreesDistance = Math.abs(otherBoid.cohortProperties.cohort - this.cohortProperties.cohort);
                if (degreesDistance > 180) {
                    degreesDistance = 360 - degreesDistance;
                }
                   
                const weight =
                    (this.worldProperties.homogenousCohorts) ?
                    Math.max(90 - degreesDistance, 0) / 90 :
                    Math.max(degreesDistance - 90, 0) / 90;

                sumX += otherBoid.x * weight;
                sumY += otherBoid.y * weight;
                sumVx += otherBoid.vx * weight;
                sumVy += otherBoid.vy * weight;
                numBoids += weight;
            } else if (
                this.worldProperties.homogenousCohorts &&    
                otherBoid.cohortProperties.cohort === this.cohortProperties.cohort ||
                !this.worldProperties.homogenousCohorts && 
                otherBoid.cohortProperties.cohort !== this.cohortProperties.cohort) {
                sumX += otherBoid.x;
                sumY += otherBoid.y;
                sumVx += otherBoid.vx;
                sumVy += otherBoid.vy;
                numBoids++;
            }

            // avoid each other
            const diffX = this.x - otherBoid.x;
            const diffY = this.y - otherBoid.y;

            // Note that dividing by the distance once gives you a unit vector in the direction of diff.
            // Divide by the square of distance to get a vector with magnitude inversely proportional,
            // and by the cube to get an inverse square relationship.
            const distanceFactor = this.boidProperties.inverseSquareAvoidance ?
                distanceSq * Math.sqrt(distanceSq) :
                distanceSq;

            const separationScale = this.boidProperties.separation / distanceFactor;
            this.deltaVx += diffX * separationScale;
            this.deltaVy += diffY * separationScale;
        }

        if (numBoids > 0) {
            // Cohesion
            // Note the strength of the cohesive impulse is directly proportional to the distance from the center
            const averageX = sumX / numBoids;
            const averageY = sumY / numBoids;
            this.deltaVx += (averageX - this.x) * this.boidProperties.cohesion;
            this.deltaVy += (averageY - this.y) * this.boidProperties.cohesion;

            // Alignment
            // Note the strength of the cohesive impulse is directly proportional to the magnitude of the misalignment
            const averageVx = sumVx / numBoids;
            const averageVy = sumVy / numBoids;

            this.deltaVx += (averageVx - this.vx) * this.boidProperties.alignment;
            this.deltaVy += (averageVy - this.vy) * this.boidProperties.alignment;
        }

        // avoid the mouse
        if (this.boidProperties.mouseAvoidance !== 0 && mousePosition) {
            // strength of avoidance is inversely proportional to distance
            const diffX = this.x - mousePosition.x;
            const diffY = this.y - mousePosition.y;
            const distanceSq = Math.max(1, square(diffX) + square(diffY));

            if (distanceSq < this.derivedBoidProperties.awarenessRadiusSq) {
                const distanceFactor = this.boidProperties.inverseSquareAvoidance ?
                    distanceSq * Math.sqrt(distanceSq) :
                    distanceSq;

                const mouseAvoidScale = this.boidProperties.mouseAvoidance / distanceFactor;
                this.deltaVx += diffX * mouseAvoidScale;
                this.deltaVy += diffY * mouseAvoidScale;
            }
        }

        // cap acceleration
        const deltaVMagnitudeSq = square(this.deltaVx) + square(this.deltaVy);
        if (deltaVMagnitudeSq > this.derivedBoidProperties.maxAccelerationSq) {
            const deltaVMagnitude = Math.sqrt(deltaVMagnitudeSq);
            const accelerationScale = this.boidProperties.maxAcceleration / deltaVMagnitude;
            this.deltaVx *= accelerationScale;
            this.deltaVy *= accelerationScale;
        }
    }

    updatePosition() {
        // distance = velocity * time + 1/2 * acceleration * time^2
        this.x += this.vx + 0.5 * this.deltaVx;
        this.y += this.vy + 0.5 * this.deltaVy;
    }

    updateVelocity() {
        // update and cap velocity
        this.vx += this.deltaVx;
        this.vy += this.deltaVy;

        this.speed = Math.sqrt(square(this.vx) + square(this.vy));
        if (this.speed < this.boidProperties.minSpeed && this.speed > 0) {
            const speedScale = this.boidProperties.minSpeed / this.speed;
            this.vx *= speedScale;
            this.vy *= speedScale;
            this.speed = this.boidProperties.minSpeed;
        } else if (this.speed > this.boidProperties.maxSpeed) {
            const speedScale = this.boidProperties.maxSpeed / this.speed;
            this.vx *= speedScale;
            this.vy *= speedScale;
            this.speed = this.boidProperties.maxSpeed;
        } // just going to ignore the === 0 case for now
    }
}


class World {
    public canvas: HTMLCanvasElement;
    public context: CanvasRenderingContext2D;
    public boids: Boid[];

    boidProperties: BoidProperties;
    derivedBoidProperties: DerivedBoidProperties
    worldProperties: WorldProperties;
    spaceBucketProperties: SpaceBucketProperties;
    colors: string[];

    mousePosition: {x: number, y: number} | null;

    spaceBuckets: Boid[][][];

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.context = canvas.getContext("2d") as CanvasRenderingContext2D;
        this.boidProperties = {...BOID_PROPERTIES_DEFAULT };
        this.derivedBoidProperties = {... DERIVED_BOID_PROPERTIES_DEFAULT};
        this.updateDerivedBoidProperties();

        this.spaceBucketProperties = SPACE_BUCKET_PROPERTIES_DEFAULT;

        this.worldProperties = {...WORLD_PROPERTIES_DEFAULT};
        this.worldProperties.cohortColors = WORLD_PROPERTIES_DEFAULT.cohortColors.slice();
        this.worldProperties.width = canvas.width;
        this.worldProperties.height = canvas.height;

        this.mousePosition = null;

        this.spaceBuckets = [];
        this.resetSpaceBuckets();

        this.colors = [];
        this.boids = []
        this.updateNumBoids();
    }

    xToBucket(x: number): number {
        const cleanX = Math.min(this.worldProperties.width, Math.max(0, x));
        return Math.floor(cleanX / this.spaceBucketProperties.bucketSize);
    }

    yToBucket(y: number): number {
        const cleanY = Math.min(this.worldProperties.height, Math.max(0, y));
        return Math.floor(cleanY / this.spaceBucketProperties.bucketSize);
    }

    updateDerivedBoidProperties() {
        this.derivedBoidProperties.awarenessRadiusSq = square(this.boidProperties.awarenessRadius);
        this.derivedBoidProperties.maxAccelerationSq = square(this.boidProperties.maxAcceleration);
    }

    resetSpaceBuckets() {
        const numXBuckets = Math.floor(canvas.width / this.spaceBucketProperties.bucketSize) + 1;
        const numYBuckets = Math.floor(canvas.height / this.spaceBucketProperties.bucketSize) + 1;
        
        this.spaceBuckets.length = numXBuckets;

        for (let x = 0; x < numXBuckets; ++x) {
            this.spaceBuckets[x] = []
            this.spaceBuckets[x].length = numYBuckets;
            
            for (let y = 0; y < numYBuckets; ++y) {
                this.spaceBuckets[x][y] = [];
            }
        }
    }
    
    clearSpaceBuckets() {
        for(let row of this.spaceBuckets) {
            for(let col of row) {
                col.length = 0;
            }
        }
    }

    updateNumBoids() {
        while (this.boids.length < this.worldProperties.numBoids) {
            const cohortSeed = Math.random();
            // more detailed cohort information is determined in updateCohorts, called below
            let cohortProperties: CohortProperties = {cohort: 0, color: "green", cohortSeed: cohortSeed};

            const boid = new Boid(
                Math.random() * this.worldProperties.width,
                Math.random() * this.worldProperties.height,
                1, Math.random() * 2 * Math.PI, 
                this.boidProperties, this.derivedBoidProperties,
                this.worldProperties, cohortProperties);

            this.boids.push(boid);

            const xBucket = this.xToBucket(boid.x);
            const yBucket = this.yToBucket(boid.y);
            this.spaceBuckets[xBucket][yBucket].push(boid);
        }

        if (this.boids.length > this.worldProperties.numBoids) {
            this.boids.length = this.worldProperties.numBoids;
        }

        this.updateCohorts();
    }

    updateCohorts() {
        this.colors = this.worldProperties.cohortColors.
            filter((value: string) => {return CSS.supports("color", value)});

        for (const boid of this.boids) {
            const cohortProperties = boid.cohortProperties;
            if (this.worldProperties.continuousCohorts) {
                cohortProperties.cohort = 360 * cohortProperties.cohortSeed;
                cohortProperties.color = `hsl(${cohortProperties.cohort} 80% 60%)`;
            } else {
                const cohort = Math.floor(this.colors.length * cohortProperties.cohortSeed);
                cohortProperties.cohort = cohort;
                cohortProperties.color = this.colors.length === 0 ? "black" : this.colors[cohort];
            }
        }
    }

    drawBoids() {
        this.context.fillStyle = `rgb(from ${this.worldProperties.backgroundColor} r g b / ${this.worldProperties.backgroundOpacity}%)`;
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
        for (let boid of this.boids) {
            boid.draw(this.context);
        }
    }

    moveBoids() {
        for (let boid of this.boids) {
            boid.updatePosition();
            boid.updateVelocity();
        }
    }   
    
    assignSpaceBuckets() {
        this.clearSpaceBuckets();

        for (let boid of this.boids) {
            const xBucket = this.xToBucket(boid.x);
            const yBucket = this.yToBucket(boid.y);
            this.spaceBuckets[xBucket][yBucket].push(boid);
        }
    }

    getNearBoids(boid: Boid): [boid: Boid, distanceSq: number][] {   
        let nearBoids: [boid: Boid, distancesq: number][] = [];
        const awarenessRadius = this.boidProperties.awarenessRadius;

        const minXBucket = this.xToBucket(boid.x - awarenessRadius);
        const maxXBucket = this.xToBucket(boid.x + awarenessRadius);
        const minYBucket = this.yToBucket(boid.y - awarenessRadius);
        const maxYBucket = this.yToBucket(boid.y + awarenessRadius);
                        
        for (let i = minXBucket; i <= maxXBucket; i++) {
            for (let j = minYBucket; j <= maxYBucket; j++) {
                for (let otherBoid of this.spaceBuckets[i][j]) {
                    if (otherBoid === boid) {
                        continue;
                    }

                    const distanceSq = boidDistanceSq(boid, otherBoid);
                    if (distanceSq < this.derivedBoidProperties.awarenessRadiusSq) {
                        nearBoids.push([otherBoid, distanceSq]);
                    }
                }
            }
        }

        return nearBoids;
    }

    updateBoids() {
        this.assignSpaceBuckets();
        for (let boid of this.boids) {
            const nearBoids = this.getNearBoids(boid);
            boid.updateAcceleration(nearBoids, this.mousePosition);
        }
    }
}

let canvas = document.getElementsByTagName("canvas")[0];
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;    


const world = new World(canvas);

canvas.addEventListener("mousemove", (e) => {
    if (world.mousePosition === null) {
        world.mousePosition = {x: 0, y: 0};
    }
    world.mousePosition.x = e.clientX;
    world.mousePosition.y = e.clientY;
  });

canvas.addEventListener("mouseout", (e) => {
    world.mousePosition = null;
  });

let running: boolean = true;
let raf: number;

canvas.addEventListener("click", (e) => {
    if (running) {
        window.cancelAnimationFrame(raf);
        running = false;
    } else {
        raf = window.requestAnimationFrame(cycle);
        running = true;
    }
});
  

interface ControlPanelFieldOptions {
    skip: boolean;
    updateFunction: () => void;
    isValid: (value: string) => boolean;
    errorMessage: string;
    inputTypeOverride: string;
    defaultArrayValue: string;
};

const CONTROL_PANEL_FIELD_OPTIONS_DEFAULT: ControlPanelFieldOptions = {
    skip: false,
    updateFunction: () => {},
    isValid: (string) => {return true},
    errorMessage: "",
    inputTypeOverride: "",
    defaultArrayValue: ""
}

type ControlPanelOptions<Properties> = {
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


function extendControlPanel<Properties extends IndexableProperties>(
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
            ...CONTROL_PANEL_FIELD_OPTIONS_DEFAULT,
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

function updatePropertiesFromCgi<Properties extends IndexableProperties>(
        keyPrefix: string,
        properties: Properties, 
        defaultProperties: Properties, 
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
            ...CONTROL_PANEL_FIELD_OPTIONS_DEFAULT,
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

const worldPropertiesOptions: ControlPanelOptions<WorldProperties> = {
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
updatePropertiesFromCgi("wp", world.worldProperties, WORLD_PROPERTIES_DEFAULT, 
    worldPropertiesOptions);
extendControlPanel("World Properties", world.worldProperties,
    worldPropertiesOptions, controlPanel);

const spaceBucketPropertiesOptions: ControlPanelOptions<SpaceBucketProperties> = {
    bucketSize: {
        updateFunction: () => {world.resetSpaceBuckets()},
        isValid: stringNumChecker(true, 1),
        errorMessage: "bucketSize must be a positive integer"
    }
};
updatePropertiesFromCgi("sp", world.spaceBucketProperties, SPACE_BUCKET_PROPERTIES_DEFAULT, 
    spaceBucketPropertiesOptions);
extendControlPanel("Space Bucket Properties", world.spaceBucketProperties,
    spaceBucketPropertiesOptions, controlPanel);

const boidPropertiesOptions: ControlPanelOptions<BoidProperties> = {
    awarenessRadius: {updateFunction: () => {world.updateDerivedBoidProperties()}},
    maxAcceleration: {updateFunction: () => {world.updateDerivedBoidProperties()}},
};
updatePropertiesFromCgi("bp", world.boidProperties, BOID_PROPERTIES_DEFAULT, boidPropertiesOptions);
extendControlPanel("Boid Properties", world.boidProperties, boidPropertiesOptions, controlPanel);


function setCgiParams<Properties extends IndexableProperties>(
        prefix: string, 
        properties: Properties,
        defaultProperties: Properties,
        propertyOptions: ControlPanelOptions<Properties>,
        searchParams: URLSearchParams) {
    for(const [key, value] of Object.entries(properties)) {
        const fieldOptions: ControlPanelFieldOptions = {
            ...CONTROL_PANEL_FIELD_OPTIONS_DEFAULT,
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
    
    setCgiParams("wp", world.worldProperties, WORLD_PROPERTIES_DEFAULT, worldPropertiesOptions, searchParams);
    setCgiParams("sp", world.spaceBucketProperties, SPACE_BUCKET_PROPERTIES_DEFAULT, spaceBucketPropertiesOptions, searchParams);
    setCgiParams("bp", world.boidProperties, BOID_PROPERTIES_DEFAULT, boidPropertiesOptions, searchParams);

    const gottenUrl = document.getElementById("gottenUrl") as HTMLElement;
    gottenUrl.innerHTML = url.toString();
}

const getUrlButton = document.getElementById("getUrlButton") as HTMLElement;
getUrlButton.addEventListener("click", getUrl);


function cycle() {
    world.updateBoids();
    world.moveBoids();
    world.drawBoids();
    
    raf = window.requestAnimationFrame(cycle)
}
        
cycle();