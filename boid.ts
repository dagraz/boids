// taking inspiration from: 
//  * https://dl.acm.org/doi/10.1145/280811.281008

//  * https://vanhunteradams.com/Pico/Animal_Movement/Boids-algorithm.html
//
// todo: 
//  * screen res
//    * provide option to match visible screen
//    * move screen res to a separate struct and make sure it DoesTheRightThing
//  * runtime property changes
//    * allow for per-field data validation and conversion (e.g. float vs int, positive values, etc)
//    * more elegant per-field callback specification instead of per-interface
//  * 3d!
//  * optimization
//    * I bet draw can be made leaner.  experiment with pre-rendering ~100 boids at different rotations and use canvas.drawImage
//    * better understand heap usage.  there is a *lot* of churn in there, it should be possible for there to be almost none.
//    * cache / memoize distance calculations
//    * near-boids are probably very stable from one cycle to the next.  add an option to update on every-other cycle.
//    * try moving from boid pointers to indices
//
// When using inverseSquare avoidance, drop cohesion by an order of magnitude and double seperation.

// used for runtime property changes
interface IndexableProperties {
    [index:string]: number | boolean | string;
}

interface CohortProperties {
    color: string;
    cohort: number;
    cohortSeed: number;
}

interface BoidPopulationProperties extends IndexableProperties {
    numBoids: number;
    continuousCohorts: boolean;
    homogenousCohorts: boolean;
    colors: string;
}

const BOID_POPULATION_PROPERTIES_DEFAULT: BoidPopulationProperties = {
    numBoids: 1000,
    continuousCohorts: false,
    homogenousCohorts: true,
    colors: "red, blue",
}

interface SpaceBucketProperties extends IndexableProperties {
    bucketSize: number;
}

const SPACE_BUCKET_PROPERTIES_DEFAULT: SpaceBucketProperties = {
    bucketSize: 50,
}

interface BoidProperties extends IndexableProperties {
    width: number;
    height: number;
    circularBorder: boolean;

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

    // Flee or chase the mouse pointer.  
    mouseAvoidance: number;
    edgeAvoidance: number;

    inverseSquareAvoidance: boolean;
};

const BOID_PROPERTIES_DEFAULT: BoidProperties = {
    width: 1000,
    height: 800,
    circularBorder: false,

    minSpeed: 0.5,
    maxSpeed: 2,
    maxAcceleration: 0.2,
    awarenessRadius: 100,
    separation: 1,
    cohesion: 0.005,
    alignment: 0.025,
    mouseAvoidance: 5,
    edgeAvoidance: 5,
    inverseSquareAvoidance: false,
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
    constructor(public x: number, public y: number, speed: number, public direction: number, 
        boidProperties: BoidProperties, boidPopulationProperties: BoidPopulationProperties, cohortProperties: CohortProperties) {
        
        this.vx = speed * Math.cos(direction);
        this.vy = speed * Math.sin(direction);
        this.deltaVx = 0;
        this.deltaVy = 0;

        this.cohortProperties = cohortProperties;
        this.boidPopulationProperties = boidPopulationProperties;
        this.boidProperties = boidProperties;
    }

    vx: number;
    vy: number;
    deltaVx: number;
    deltaVy: number;

    cohortProperties: CohortProperties;
    boidPopulationProperties: BoidPopulationProperties;
    boidProperties: BoidProperties;

    public draw(context: CanvasRenderingContext2D) {
        // turns out save/restore/rotate are a little pricey for how lightly this uses them.
        // doing the equiv work by hand shaves off a non-trivial hunk of cpu time.
        context.translate(Math.floor(this.x), Math.floor(this.y));

        const cos = Math.cos(this.direction);
        const sin = Math.sin(this.direction);

        context.beginPath();
        context.moveTo(Math.floor(7 * cos), Math.floor(7 * sin));
        context.lineTo(Math.floor(-3 * sin), Math.floor(3 * cos));
        context.lineTo(Math.floor(3 * sin), Math.floor(-3 * cos));
        context.closePath();

        context.fillStyle = this.cohortProperties.color;
        context.fill();

        context.translate(-Math.floor(this.x), -Math.floor(this.y));
    }


    edgeAvoidance(edgeDistance: number): number {
        if (edgeDistance <= 1) {
            return this.boidProperties.edgeAvoidance;
        } else {
            if (this.boidProperties.inverseSquareAvoidance) {
                return this.boidProperties.edgeAvoidance / edgeDistance / edgeDistance;
            } else {
                return this.boidProperties.edgeAvoidance / edgeDistance;
            }
        }
    }

    updateAcceleration(nearBoids: [boid: Boid, distanceSq: number][], mousePosition: {x: number, y: number} | null) {
        this.deltaVx = 0;
        this.deltaVy = 0;

        // avoid edges
        if (this.boidProperties.circularBorder) {
            const centerWidth = 0.5 * this.boidProperties.width;
            const centerHeight = 0.5 * this.boidProperties.height;
            const distanceFromCenter = Math.sqrt(
                square(this.x - centerWidth) + square(this.y - centerHeight));
                
            const distanceFromEdge = 0.5 * Math.min(this.boidProperties.width, this.boidProperties.height) - 
                distanceFromCenter;
            const edgeAvoidance = this.edgeAvoidance(distanceFromEdge);
            this.deltaVx += edgeAvoidance * (centerWidth - this.x) / distanceFromCenter;
            this.deltaVy += edgeAvoidance * (centerHeight - this.y) / distanceFromCenter;
        } else {
            // rectangular border
            this.deltaVx += this.edgeAvoidance(this.x);
            this.deltaVx -= this.edgeAvoidance(this.boidProperties.width - this.x);
            this.deltaVy += this.edgeAvoidance(this.y);
            this.deltaVy -= this.edgeAvoidance(this.boidProperties.height - this.y);
        }

        let sumX = 0;
        let sumY = 0;
        let sumVx = 0;
        let sumVy = 0;
        let numBoids = 0;
        
        for (const [otherBoid, distanceSq] of nearBoids) {
            // Boids will only cohere and align with members of the same cohort
            if (this.boidPopulationProperties.continuousCohorts) {
                const baseWeight = Math.min(
                    Math.abs(otherBoid.cohortProperties.cohort - this.cohortProperties.cohort),
                    360 - Math.abs(otherBoid.cohortProperties.cohort - this.cohortProperties.cohort)) / 180;
                const weight = this.boidPopulationProperties.homogenousCohorts ?
                    1 - baseWeight :
                    baseWeight;
                
                sumX += otherBoid.x * weight;
                sumY += otherBoid.y * weight;
                sumVx += otherBoid.vx * weight;
                sumVy += otherBoid.vy * weight;
                numBoids += weight;
            } else if (otherBoid.cohortProperties.cohort === this.cohortProperties.cohort) {
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

            this.deltaVx += diffX / distanceFactor * this.boidProperties.separation;
            this.deltaVy += diffY / distanceFactor * this.boidProperties.separation;
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

            const distanceFactor = this.boidProperties.inverseSquareAvoidance ?
                distanceSq * Math.sqrt(distanceSq) :
                distanceSq;
            this.deltaVx += diffX / distanceFactor * this.boidProperties.mouseAvoidance;
            this.deltaVy += diffY / distanceFactor * this.boidProperties.mouseAvoidance;
        }

        // cap acceleration
        // We only need the sqrt when the cap is active. 
        // todo: fix
        const deltaVMagnitude = Math.sqrt(square(this.deltaVx) + square(this.deltaVy));
        if (deltaVMagnitude > this.boidProperties.maxAcceleration) {
            this.deltaVx *= this.boidProperties.maxAcceleration / deltaVMagnitude;
            this.deltaVy *= this.boidProperties.maxAcceleration / deltaVMagnitude;
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
        
        const vMagnitude = Math.sqrt(square(this.vx) + square(this.vy));
        if (vMagnitude > this.boidProperties.maxSpeed) {
            this.vx *= this.boidProperties.maxSpeed / vMagnitude;
            this.vy *= this.boidProperties.maxSpeed / vMagnitude;
        } else if (vMagnitude < this.boidProperties.minSpeed && vMagnitude > 0) {
            this.vx *= this.boidProperties.minSpeed / vMagnitude;
            this.vy *= this.boidProperties.minSpeed / vMagnitude;
        } // just going to ignore the === 0 case for now
                
        this.direction = Math.atan2(this.vy, this.vx);
    }
}


class World {
    public canvas: HTMLCanvasElement;
    public context: CanvasRenderingContext2D;
    public boids: Boid[];

    boidProperties: BoidProperties;
    boidPopulationProperties: BoidPopulationProperties;
    spaceBucketProperties: SpaceBucketProperties;
    colors: string[];

    mousePosition: {x: number, y: number} | null;

    spaceBuckets: Boid[][][];

    xToBucket(x: number): number {
        const cleanX = Math.min(this.boidProperties.width, Math.max(0, x));
        return Math.floor(cleanX / this.spaceBucketProperties.bucketSize);
    }

    yToBucket(y: number): number {
        const cleanY = Math.min(this.boidProperties.height, Math.max(0, y));
        return Math.floor(cleanY / this.spaceBucketProperties.bucketSize);
    }

    constructor(canvas: HTMLCanvasElement,
        public useSpaceBuckets: boolean, boidProperties: Partial<BoidProperties>, 
        bpp: Partial<BoidPopulationProperties>) {

        this.canvas = canvas;
        this.context = canvas.getContext("2d", {alpha: false}) as CanvasRenderingContext2D;
        this.boidProperties = {...BOID_PROPERTIES_DEFAULT, 
            width: canvas.width,
            height: canvas.height,
            ...boidProperties
        };

        this.spaceBucketProperties = SPACE_BUCKET_PROPERTIES_DEFAULT;

        // Bug in tsc?  without the second term explicitly assigning numBoids, tsc throws a type error.
        //    Type 'string | number | boolean | undefined' is not assignable to type 'string | number | boolean'.
        //    Type 'undefined' is not assignable to type 'string | number | boolean'.ts(2322)
        // weirdly, this compiles fine in 4.5.4.  Poking around online finds complaints of this error in similar contexts in the 2.x series.  
        // possible regression?
        this.boidPopulationProperties = {...BOID_POPULATION_PROPERTIES_DEFAULT, numBoids: BOID_POPULATION_PROPERTIES_DEFAULT.numBoids, ...bpp};

        this.colors = [];

        this.mousePosition = null;

        this.spaceBuckets = [];
        this.resetSpaceBuckets();

        this.boids = []

        this.updateNumBoids();
    }

    resetSpaceBuckets() {
        if (this.useSpaceBuckets) {
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
    }

    clearSpaceBuckets() {
        for(let row of this.spaceBuckets) {
            for(let col of row) {
                col.length = 0;
            }
        }
    }

    updateNumBoids() {
        while (this.boids.length < this.boidPopulationProperties.numBoids) {
            const cohortSeed = Math.random();
            // more detailed cohort information is determined in updateCohorts, called below
            let cohortProperties: CohortProperties = {cohort: 0, color: "green", cohortSeed: cohortSeed};

            const boid = new Boid(
                (Math.random() * 0.8 + 0.1) * this.boidProperties.width,
                (Math.random() * 0.8 + 0.1) * this.boidProperties.height,
                1, Math.random() * 2 * Math.PI, this.boidProperties, this.boidPopulationProperties, cohortProperties);

            this.boids.push(boid);

            if (this.useSpaceBuckets) {
                const xBucket = this.xToBucket(boid.x);
                const yBucket = this.yToBucket(boid.y);
                this.spaceBuckets[xBucket][yBucket].push(boid);
            }
        }

        if (this.boids.length > this.boidPopulationProperties.numBoids) {
            this.boids.length = this.boidPopulationProperties.numBoids;
        }

        this.updateCohorts();
    }

    updateCohorts() {
        // todo: we need safety checking and reasonable fallback for bad values
        this.colors = this.boidPopulationProperties.colors.split(',');

        for (const boid of this.boids) {
            const cohortProperties = boid.cohortProperties;
            if (this.boidPopulationProperties.continuousCohorts) {
                cohortProperties.cohort = 360 * cohortProperties.cohortSeed;
                cohortProperties.color = `hsl(${cohortProperties.cohort} 80% 60%)`;
            } else {
                const cohort = Math.floor(this.colors.length * cohortProperties.cohortSeed);
                cohortProperties.cohort = cohort;
                cohortProperties.color = this.colors[cohort];
            }
        }
    }

    drawBoids() {
        //this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.fillStyle = "rgb(255 255 255 / 10%)";
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

    getNearBoidsQuadratic(boid: Boid): [boid: Boid, distanceSq: number][] {
        let nearBoids: [Boid, number][] = [];

        for (let otherBoid of this.boids) {
            if (otherBoid === boid) {
                continue;
            }

            const distanceSq = boidDistanceSq(boid, otherBoid);
            if (distanceSq< square(this.boidProperties.awarenessRadius)) {
                nearBoids.push([otherBoid, distanceSq]);
            }
        }

        return nearBoids;
    }

    getNearBoids(boid: Boid): [boid: Boid, distanceSq: number][] {   
        let nearBoids: [boid: Boid, distancesq: number][] = [];
        const awarenessRadius = this.boidProperties.awarenessRadius;
        const sqAwarenessRadius = square(awarenessRadius);

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
                    if (distanceSq < sqAwarenessRadius) {
                        nearBoids.push([otherBoid, distanceSq]);
                    }
                }
            }
        }

        return nearBoids;
    }

    updateBoids() {
        if (this.useSpaceBuckets) {
            this.assignSpaceBuckets();
            for (let boid of this.boids) {
                const nearBoids = this.getNearBoids(boid);
                boid.updateAcceleration(nearBoids, this.mousePosition);
            }
        } else {
            for (let boid of this.boids) {
                const nearBoids = this.getNearBoidsQuadratic(boid);
                boid.updateAcceleration(nearBoids, this.mousePosition);
            }
        }
    }
}

let canvas = document.getElementsByTagName("canvas")[0];
canvas.width = 1000;
canvas.height = 800;    

const world = new World(canvas, true, 
    {circularBorder: false, }, {numBoids: 2000, continuousCohorts: false, homogenousCohorts: true, });

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
  
function cycle() {
    world.updateBoids();
    world.moveBoids();
    world.drawBoids();

    raf = window.requestAnimationFrame(cycle)
}


function extendControlPanel<Properties extends IndexableProperties>(
    properties: Properties, defaultProperties: Properties, controlPanel: HTMLDivElement,
    update?: () => void) {
    for (const [kkey, value] of Object.entries(properties)) {
        const key = kkey as keyof Properties;
        const input = document.createElement('input') as HTMLInputElement;
        input.setAttribute('name', key as string);
        input.setAttribute('value', value.toString());

        if (typeof properties[key] === "number") {
            input.setAttribute('type', 'number');
        } else if (typeof properties[key] === "boolean") {
            input.setAttribute('type', 'checkbox');
            input.toggleAttribute('checked', properties[key] as boolean);
        }
        
        const label = document.createElement('label');
        label.innerHTML = key as string;
        label.appendChild(input);
        
        controlPanel.appendChild(label);
        
        input.addEventListener("change", () => {
            if (typeof properties[key] === "number") {
                const value = parseFloat(input.value);
                properties[key] = (isNaN(value) ?
                    defaultProperties[key] : value) as Properties[typeof key];
            } else if (typeof properties[key] === "boolean") {
                properties[key] = input.checked as Properties[typeof key];
            } else if (typeof properties[key] === "string") {
                properties[key] = input.value as Properties[typeof key];
            }

            if (update !== undefined) {
                update();
            }
        });
    }
}

const controlPanel = document.querySelector("[name=controlPanel]") as HTMLDivElement;
extendControlPanel(world.boidPopulationProperties, BOID_POPULATION_PROPERTIES_DEFAULT, controlPanel, 
    () => {world.updateNumBoids()});
extendControlPanel(world.spaceBucketProperties, SPACE_BUCKET_PROPERTIES_DEFAULT, controlPanel, 
    () => {world.resetSpaceBuckets()});
extendControlPanel(world.boidProperties, BOID_PROPERTIES_DEFAULT, controlPanel);

cycle();