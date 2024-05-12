// taking inspiration from: https://vanhunteradams.com/Pico/Animal_Movement/Boids-algorithm.html
//

interface Position {
    x: number;
    y: number;
}

interface BoidProperties {
    minSpeed: number;
    maxSpeed: number;
    maxAcceleration: number;

    awarenessRadiusSq: number;

    // If we want to experiement with Boids having a blind spot behind them
    // awarenessField: number;

    separation: number;
    cohesion: number;
    alignment: number;

    // Flee or chase the mouse pointer.  
    mouseAvoidance: number;

    edgeAvoidance: number;
    edgeAwareness: number;
}

const DEFAULT_BOID_PROPERTIES: BoidProperties = {
    minSpeed: 0.5,
    maxSpeed: 2,
    maxAcceleration: 0.2,
    awarenessRadiusSq: 10000,
    separation: 1,
    cohesion: 0.005,
    alignment: 0.025,
    mouseAvoidance: 5,
    edgeAvoidance: 5,
    edgeAwareness: 100
};

interface WorldProperties {
    width: number;
    height: number;
};

class Boid {
    constructor(public x: number, public y: number, speed: number, public direction: number, wp: WorldProperties) {
        this.vx = speed * Math.cos(direction);
        this.vy = speed * Math.sin(direction);
        this.deltaVx = 0;
        this.deltaVy = 0;

        this.properties = DEFAULT_BOID_PROPERTIES;
        this.worldProperties = wp;
    }

    vx: number;
    vy: number;
    deltaVx: number;
    deltaVy: number;

    properties: BoidProperties;
    worldProperties: WorldProperties;

    public draw(context: CanvasRenderingContext2D) {
        context.save()
        context.translate(this.x, this.y);
        context.rotate(this.direction);
        context.beginPath();
        context.moveTo(7, 0);
        context.lineTo(0,3);
        context.lineTo(0,-3);
        context.closePath();
        context.fillStyle = "red";
        context.fill();
        context.restore();
    }

    edgeAvoidance(edgeDistance: number): number {
        const edgeAwareness = this.properties.edgeAwareness;
        if (edgeDistance === 0) {
            return this.properties.edgeAvoidance;
        } else if (edgeDistance < edgeAwareness) {
            return this.properties.edgeAvoidance / edgeDistance;
        } else {
            return 0;
        }
    }

    update(nearBoids: Boid[], mousePosition: Position | null) {
        this.deltaVx = 0;
        this.deltaVy = 0;

        // avoid edges
        this.deltaVx += this.edgeAvoidance(this.x);
        this.deltaVx -= this.edgeAvoidance(this.worldProperties.width - this.x);
        this.deltaVy += this.edgeAvoidance(this.y);
        this.deltaVy -= this.edgeAvoidance(this.worldProperties.height - this.y);
        
        let sumX = 0;
        let sumY = 0;
        let sumVx = 0;
        let sumVy = 0;
        let numBoids = 0;
        
        for (const otherBoid of nearBoids) {
            sumX += otherBoid.x;
            sumY += otherBoid.y;
            sumVx += otherBoid.vx;
            sumVy += otherBoid.vy;
            numBoids++;

            // avoid each other
            // strength of avoidance is inversely proportional to distance
            const distanceSq = Math.max(1, boidDistanceSq(this, otherBoid));
            const diffX = this.x - otherBoid.x;
            const diffY = this.y - otherBoid.y;

            this.deltaVx += diffX / distanceSq * this.properties.separation;
            this.deltaVy += diffY / distanceSq * this.properties.separation;
        }

        if (numBoids > 0) {
            // Cohesion
            // Note the strength of the cohesive impulse is directly proportional to the distance from the center
            const averageX = sumX / numBoids;
            const averageY = sumY / numBoids;
            this.deltaVx += (averageX - this.x) * this.properties.cohesion;
            this.deltaVy += (averageY - this.y) * this.properties.cohesion;

            // Alignment
            // Note the strength of the cohesive impulse is directly proportional to the magnitude of the misalignment
            const averageVx = sumVx / numBoids;
            const averageVy = sumVy / numBoids;

            this.deltaVx += (averageVx - this.deltaVx) * this.properties.alignment;
            this.deltaVy += (averageVy - this.deltaVy) * this.properties.alignment;
        }

        // avoid the mouse
        if (this.properties.mouseAvoidance !== 0 && mousePosition) {
            // strength of avoidance is inversely proportional to distance
            const diffX = this.x - mousePosition.x;
            const diffY = this.y - mousePosition.y;
            const distanceSq = Math.max(1, square(diffX) + square(diffY));

            this.deltaVx += diffX / distanceSq * this.properties.mouseAvoidance;
            this.deltaVy += diffY / distanceSq * this.properties.mouseAvoidance;

        }

        // cap acceleration
        const deltaVMagnitude = Math.sqrt(square(this.deltaVx) + square(this.deltaVy));
        if (deltaVMagnitude > this.properties.maxAcceleration) {
            this.deltaVx *= this.properties.maxAcceleration / deltaVMagnitude;
            this.deltaVy *= this.properties.maxAcceleration / deltaVMagnitude;
        }

        // update and cap velocity
        this.vx += this.deltaVx;
        this.vy += this.deltaVy;

        const vMagnitude = Math.sqrt(square(this.vx) + square(this.vy));
        if (vMagnitude > this.properties.maxSpeed) {
            this.vx *= this.properties.maxSpeed / vMagnitude;
            this.vy *= this.properties.maxSpeed / vMagnitude;
        } else if (vMagnitude < this.properties.minSpeed && vMagnitude > 0) {
            this.vx *= this.properties.minSpeed / vMagnitude;
            this.vy *= this.properties.minSpeed / vMagnitude;
        } // just going to ignore the === 0 case for now
        
        this.direction = Math.atan2(this.vy, this.vx);
    }
}

function square(x: number): number {
    return x * x;
}

function boidDistanceSq(boidA: Boid, boidB: Boid): number {

    return square(boidA.x - boidB.x) + square(boidA.y - boidB.y);
}

function boidDistance(boidA: Boid, boidB: Boid): number {
    return Math.sqrt(boidDistanceSq(boidA, boidB));
}

class World {
    public canvas: HTMLCanvasElement;
    public context: CanvasRenderingContext2D;
    public boids: Boid[];

    properties: WorldProperties;

    mousePosition: Position | null;

    constructor(canvas: HTMLCanvasElement, num_boids: number) {
        this.canvas = canvas;
        this.context = canvas.getContext("2d") as CanvasRenderingContext2D;
        this.properties = {
            width: canvas.width,
            height: canvas.height
        };

        this.mousePosition = null;

        this.boids = []
        while (this.boids.length < num_boids) {
            this.boids.push(new Boid(
                (Math.random() * 0.8 + 0.1) * this.properties.width,
                (Math.random() * 0.8 + 0.1) * this.properties.height,
                1, Math.random() * 2 * Math.PI, this.properties));
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
            boid.x += boid.vx + 0.5 * boid.deltaVx;
            boid.y += boid.vy + 0.5 * boid.deltaVy;
        }
    }   
    
    // Brute force O(n^2).
    // TODO: look into a spatial data structure
    getNearBoids(boid: Boid): Boid[] {
        let nearBoids: Boid[] = [];

        for (let otherBoid of this.boids) {
            if (otherBoid === boid) {
                continue;
            }

            if (boidDistanceSq(boid, otherBoid) < boid.properties.awarenessRadiusSq) {
                nearBoids.push(otherBoid);
            }
        }

        return nearBoids;
    }

    updateBoids() {
        for (let boid of this.boids) {
            boid.update(this.getNearBoids(boid), this.mousePosition);
        }
    }
}

let canvas = document.getElementsByTagName("canvas")[0];
canvas.width = 1000;
canvas.height = 800;    

const world = new World(canvas, 1000);

canvas.addEventListener("mousemove", (e) => {
    if (world.mousePosition === null) {
        world.mousePosition = {x: 0, y: 0} as Position;
    }
    world.mousePosition.x = e.clientX;
    world.mousePosition.y = e.clientY;
  });

canvas.addEventListener("mouseout", (e) => {
    world.mousePosition = null;
  });
  
function cycle() {
    world.updateBoids();
    world.moveBoids();
    world.drawBoids();

    window.requestAnimationFrame(cycle)
}

cycle();
