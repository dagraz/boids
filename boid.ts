// taking inspiration from: 
//  * https://dl.acm.org/doi/10.1145/280811.281008
//  * https://vanhunteradams.com/Pico/Animal_Movement/Boids-algorithm.html
//
// todo: 
//  * configuration changes
//    * legibility
//      * make control panel more legible
//      * figure out how to make the generated URL wrap or be in a scrolling box or something
//  * configuration / property management (on-page control-panel, cgi parsing, url generation) 
//    feels like it could be cleaned up and wrapped into a separate library.
//  * 3d!
//  * made the animation cycle sensitive to passed time


// used for runtime property changes
export interface IndexableProperties {
    [index:string]: number | boolean | string | string[];
}

export interface CohortProperties {
    color: string;
    cohort: number;
    cohortSeed: number;
}

export interface WorldProperties extends IndexableProperties {
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

export const worldPropertiesDefault: WorldProperties = {
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


export interface SpaceBucketProperties extends IndexableProperties {
    bucketSize: number;
}

export const spaceBucketPropertiesDefault: SpaceBucketProperties = {
    bucketSize: 25,
}

export interface BoidProperties extends IndexableProperties {
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

export const boidPropertiesDefault: BoidProperties = {
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

// TODO: this should be a shared function call
const derivedBoidPropertiesDefault: DerivedBoidProperties = {
    maxAccelerationSq: square(boidPropertiesDefault.maxAcceleration),
    awarenessRadiusSq: square(boidPropertiesDefault.awarenessRadius),
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

export class Boid {
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


export class World {
    public canvas: HTMLCanvasElement;
    public context: CanvasRenderingContext2D;
    public boids: Boid[];

    boidProperties: BoidProperties;
    derivedBoidProperties: DerivedBoidProperties
    worldProperties: WorldProperties;
    spaceBucketProperties: SpaceBucketProperties;
    colors: string[];

    mousePosition: {x: number, y: number} | null;
    running: boolean = true;
    reqAnimationFrameReturn: number = 0;
    
    spaceBuckets: Boid[][][];

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.context = canvas.getContext("2d") as CanvasRenderingContext2D;
        this.boidProperties = {...boidPropertiesDefault };
        this.derivedBoidProperties = {... derivedBoidPropertiesDefault};
        this.updateDerivedBoidProperties();

        this.spaceBucketProperties = spaceBucketPropertiesDefault;

        this.worldProperties = {...worldPropertiesDefault};
        this.worldProperties.cohortColors = worldPropertiesDefault.cohortColors.slice();
        this.worldProperties.width = canvas.width;
        this.worldProperties.height = canvas.height;

        this.mousePosition = null;

        this.spaceBuckets = [];
        this.resetSpaceBuckets();

        this.colors = [];
        this.boids = []
        this.updateNumBoids();

        this.setupMouse();
    }

    setupMouse() {
        this.canvas.addEventListener("mousemove", (e) => {
            if (this.mousePosition === null) {
                this.mousePosition = {x: 0, y: 0};
            }
            this.mousePosition.x = e.clientX;
            this.mousePosition.y = e.clientY;
          });
        
        this.canvas.addEventListener("mouseout", (e) => {
            this.mousePosition = null;
          });
        
        
        this.canvas.addEventListener("click", (e) => {
            if (this.running) {
                window.cancelAnimationFrame(this.reqAnimationFrameReturn);
                this.running = false;
            } else {
                this.reqAnimationFrameReturn = window.requestAnimationFrame(() => this.cycle());
                this.running = true;
            }
        });
        
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
        const numXBuckets = Math.floor(this.canvas.width / this.spaceBucketProperties.bucketSize) + 1;
        const numYBuckets = Math.floor(this.canvas.height / this.spaceBucketProperties.bucketSize) + 1;
        
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

    cycle() {
        this.updateBoids();
        this.moveBoids();
        this.drawBoids();
        
        this.reqAnimationFrameReturn = window.requestAnimationFrame(() => this.cycle())
    }
    
}

