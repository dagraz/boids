// taking inspiration from: https://vanhunteradams.com/Pico/Animal_Movement/Boids-algorithm.html
//
// todo: 
//  * build a general mechanism for modifying world properties at runtime
//    * extract cohort setting to separate function
//    * write a general re-cohort method
//    * s/boidProperties/boidCohortProperties/
//    * extract boid properties from WorldProperties
//  * 3d!
//  * autosize canvas to visible space
//  * I bet draw can be made leaner.  experiment with pre-rendering ~100 boids at different rotations and use canvas.drawImage
//  * better understand heap usage.  there is a *lot* of churn in there, it should be possible for there to be almost none.


interface CohortProperties {
    color: string;
    cohort: number;
}

interface CohortSetup {
    continuousCohorts: boolean;
    homogenousCohorts: boolean;
    colors: string[];
}

const DEFAULT_COHORT_SETUP: CohortSetup = {
    continuousCohorts: false,
    homogenousCohorts: true,
    colors: ["red", "blue",],
}

interface BoidProperties {
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

    [index:string]: number | boolean;
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
        boidProperties: BoidProperties, cohortProperties: CohortSetup, properties: CohortProperties) {
        
        this.vx = speed * Math.cos(direction);
        this.vy = speed * Math.sin(direction);
        this.deltaVx = 0;
        this.deltaVy = 0;

        this.cohortProperties = properties;
        this.cohortSetup = cohortProperties;
        this.boidProperties = boidProperties;
    }

    vx: number;
    vy: number;
    deltaVx: number;
    deltaVy: number;

    cohortProperties: CohortProperties;
    cohortSetup: CohortSetup;
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
            return this.boidProperties.edgeAvoidance / edgeDistance;
        }
    }

    updateAcceleration(nearBoids: Boid[], mousePosition: {x: number, y: number} | null) {
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
        
        for (const otherBoid of nearBoids) {
            // Boids will only cohere and align with members of the same cohort
            if (this.cohortSetup.continuousCohorts) {
                const baseWeight = Math.min(
                    Math.abs(otherBoid.cohortProperties.cohort - this.cohortProperties.cohort),
                    360 - Math.abs(otherBoid.cohortProperties.cohort - this.cohortProperties.cohort)) / 180;
                const weight = this.cohortSetup.homogenousCohorts ?
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
            // strength of avoidance is inversely proportional to distance
            // (*not* inversely proportional to the square of the distance!  dividing out by the non-squared distance 
            // gives you a unit-direction vector, so the magnitude would be invariant to the distance.)
            const distanceSq = Math.max(1, boidDistanceSq(this, otherBoid));
            const diffX = this.x - otherBoid.x;
            const diffY = this.y - otherBoid.y;

            this.deltaVx += diffX / distanceSq * this.boidProperties.separation;
            this.deltaVy += diffY / distanceSq * this.boidProperties.separation;
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

            this.deltaVx += (averageVx - this.deltaVx) * this.boidProperties.alignment;
            this.deltaVy += (averageVy - this.deltaVy) * this.boidProperties.alignment;
        }

        // avoid the mouse
        if (this.boidProperties.mouseAvoidance !== 0 && mousePosition) {
            // strength of avoidance is inversely proportional to distance
            const diffX = this.x - mousePosition.x;
            const diffY = this.y - mousePosition.y;
            const distanceSq = Math.max(1, square(diffX) + square(diffY));

            this.deltaVx += diffX / distanceSq * this.boidProperties.mouseAvoidance;
            this.deltaVy += diffY / distanceSq * this.boidProperties.mouseAvoidance;

        }

        // cap acceleration
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

    //boidProperties: BoidProperties;
    boidProperties: {
        [Property in keyof BoidProperties]: BoidProperties[Property];
    };

    cohortProperties: CohortSetup;

    mousePosition: {x: number, y: number} | null;

    spaceBuckets: Boid[][][];
    bucketXSize: number;
    bucketYSize: number;

    xToBucket(x: number): number {
        const cleanX = Math.min(this.boidProperties.width, Math.max(0, x));
        return Math.floor(cleanX / this.bucketXSize);
    }

    yToBucket(y: number): number {
        const cleanY = Math.min(this.boidProperties.height, Math.max(0, y));
        return Math.floor(cleanY / this.bucketYSize);
    }

    constructor(canvas: HTMLCanvasElement, numBoids: number, 
        public useSpaceBuckets: boolean, boidProperties: Partial<BoidProperties>, 
        cp: Partial<CohortSetup>) {

        this.canvas = canvas;
        this.context = canvas.getContext("2d", {alpha: false}) as CanvasRenderingContext2D;
        this.boidProperties = {...BOID_PROPERTIES_DEFAULT, 
            width: canvas.width,
            height: canvas.height,
            ...boidProperties
        };
        this.cohortProperties = {...DEFAULT_COHORT_SETUP, ...cp};
        this.mousePosition = null;

        this.bucketXSize = 50;
        this.bucketYSize = 50;

        this.spaceBuckets = [];

        if (useSpaceBuckets) {
            const numXBuckets = Math.floor(canvas.width / this.bucketXSize) + 1;
            const numYBuckets = Math.floor(canvas.height / this.bucketYSize) + 1;
        
            this.spaceBuckets.length = numXBuckets;

            for (let x = 0; x < numXBuckets; ++x) {
                this.spaceBuckets[x] = []
                this.spaceBuckets[x].length = numYBuckets;
            
                for (let y = 0; y < numYBuckets; ++y) {
                    this.spaceBuckets[x][y] = [];
                }
            }
        }

        this.boids = []

        this.updateNumBoids(numBoids);
    }

    updateNumBoids(numBoids: number) {
        while (this.boids.length < numBoids) {
            let boidProperties: CohortProperties = {cohort: 0, color: "red"};
            if (this.cohortProperties.continuousCohorts) {
                boidProperties.cohort = 360 * Math.random();
                //boidProperties.color = `hsl(${boidProperties.cohort} 100% 50%)`;
                boidProperties.color = `hsl(${boidProperties.cohort} 80% 60%)`;
            } else {
                const cohort = Math.floor(this.cohortProperties.colors.length * Math.random());
                boidProperties.cohort = cohort;
                boidProperties.color = this.cohortProperties.colors[cohort];
            }

            const boid = new Boid(
                (Math.random() * 0.8 + 0.1) * this.boidProperties.width,
                (Math.random() * 0.8 + 0.1) * this.boidProperties.height,
                1, Math.random() * 2 * Math.PI, this.boidProperties, this.cohortProperties, boidProperties);

            this.boids.push(boid);

            if (this.useSpaceBuckets) {
                const xBucket = this.xToBucket(boid.x);
                const yBucket = this.yToBucket(boid.y);
                this.spaceBuckets[xBucket][yBucket].push(boid);
            }
        }

        if (this.boids.length > numBoids) {
            this.boids.length = numBoids;
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

    clearSpaceBuckets() {
        for(let row of this.spaceBuckets) {
            for(let col of row) {
                col.length = 0;
            }
        }
    }

    moveBoids() {
        if (this.useSpaceBuckets) {
            this.clearSpaceBuckets();
        }

        for (let boid of this.boids) {
            boid.updatePosition();
            boid.updateVelocity();

            if (this.useSpaceBuckets) {
                const xBucket = this.xToBucket(boid.x);
                const yBucket = this.yToBucket(boid.y);
                this.spaceBuckets[xBucket][yBucket].push(boid);
            }
        }
    }   
    
    getNearBoidsQuadratic(boid: Boid): Boid[] {
        let nearBoids: Boid[] = [];

        for (let otherBoid of this.boids) {
            if (otherBoid === boid) {
                continue;
            }

            if (boidDistanceSq(boid, otherBoid) < square(this.boidProperties.awarenessRadius)) {
                nearBoids.push(otherBoid);
            }
        }

        return nearBoids;
    }

    getNearBoids(boid: Boid): Boid[] {   
        let nearBoids: Boid[] = [];
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

                    if (boidDistanceSq(boid, otherBoid) < sqAwarenessRadius) {
                        nearBoids.push(otherBoid);
                    }
                }
            }
        }

        return nearBoids;
    }

    updateBoids() {
        for (let boid of this.boids) {
            const nearBoids = this.useSpaceBuckets ?
                this.getNearBoids(boid) :
                this.getNearBoidsQuadratic(boid);

            boid.updateAcceleration(nearBoids, this.mousePosition);
        }
    }
}

let canvas = document.getElementsByTagName("canvas")[0];
canvas.width = 1000;
canvas.height = 800;    

const world = new World(canvas, 2000, true, 
    {circularBorder: false, }, {continuousCohorts: false, homogenousCohorts: true, });

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

const borderType = document.querySelector("[name=borderType]") as HTMLInputElement;
borderType.addEventListener("change", (evt) => {
    world.boidProperties.circularBorder = borderType.checked;
});

const numBoidsInput = document.querySelector("[name=numBoids]") as HTMLInputElement;
numBoidsInput.value = world.boids.length.toString();
numBoidsInput.addEventListener("change", (evt) => {
    world.updateNumBoids(parseInt(numBoidsInput.value));
    return false;
});

const controlPanel = document.querySelector("[name=controlPanel]") as HTMLDivElement;

for (const [key, value] of Object.entries(world.boidProperties)) {
    if (typeof world.boidProperties[key] === "number") {
        const input = document.createElement('input') as HTMLInputElement;
        input.setAttribute('type', 'number');
        input.setAttribute('name', key);
        input.setAttribute('value', value.toString());
        
        const label = document.createElement('label');
        label.innerHTML = key;
        label.appendChild(input);
        
        controlPanel.appendChild(label);
        
        input.addEventListener("change", () => {
            // todo: check for NaN, negative numbers.  fall back to default
            
            world.boidProperties[key] = parseFloat(input.value);
            console.log(input.value);
            console.log(world.boidProperties.cohesion);
        });
        
    }    
}

/*
// Proof of concept for creating a property input from code.
const input = document.createElement('input') as HTMLInputElement;
input.setAttribute('type', 'number');
input.setAttribute('name', 'cohesion');
input.setAttribute('value', world.boidProperties.cohesion.toString());

const label = document.createElement('label');
label.innerHTML = "cohesion";
label.appendChild(input);

controlPanel.appendChild(label);

input.addEventListener("change", () => {
    // todo: check for NaN, negative numbers.  fall back to default
    world.boidProperties.cohesion = parseFloat(input.value);
    console.log(input.value);
    console.log(world.boidProperties.cohesion);
});
*/

cycle();