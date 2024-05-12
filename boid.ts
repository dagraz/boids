// taking inspiration from: https://vanhunteradams.com/Pico/Animal_Movement/Boids-algorithm.html
//

interface BoidProperties {
    minSpeed: number;
    maxSpeed: number;
    maxAcceleration: number;

    /*
    awarenessRadius: number;
    awarenessField: number;

    separation: number;
    alignment: number;
    cohesion: number;
*/
    edgeAvoidance: number;
}

const DEFAULT_BOID_PROPERTIES: BoidProperties = {
    minSpeed: 0.5,
    maxSpeed: 2,
    maxAcceleration: 0.5,
    edgeAvoidance: 0.01
};

interface WorldProperties {
    width: number;
    height: number;
};

class Boid {
    constructor(public x = 150, public y = 100, public speed = 1, public direction = Math.PI, wp: WorldProperties) {
        this.vx = speed * Math.cos(direction);
        this.vy = speed * Math.sin(direction);
        this.properties = DEFAULT_BOID_PROPERTIES;
        this.worldProperties = wp;
    }

    vx: number;
    vy: number;
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
        context.fillStyle = "blue";
        context.fill();
        context.restore();
    }

    edgeAvoidance(edgeDistance: number): number {
        if (edgeDistance < 100) {
            return Math.max(1, (1 - edgeDistance / 100 )) * 0.01;
        } else {
            return 0;
        }
    }

    update() {
        let delta_vx = 0;
        let delta_vy = 0;

        // avoid edges
        delta_vx += this.edgeAvoidance(this.x);
        delta_vx -= this.edgeAvoidance(this.worldProperties.width - this.x);
        delta_vy += this.edgeAvoidance(this.y);
        delta_vy -= this.edgeAvoidance(this.worldProperties.height - this.y);
        
        // todo: cap acceleration
        // todo: cap velocity
        this.vx += delta_vx;
        this.vy += delta_vy;
        
        this.direction = Math.atan2(this.vy, this.vx);
    }
}


class World {
    public canvas: HTMLCanvasElement;
    public context: CanvasRenderingContext2D;
    public boids: Boid[];

    properties: WorldProperties;

    constructor(canvas: HTMLCanvasElement, num_boids: number) {
        this.canvas = canvas;
        this.context = canvas.getContext("2d") as CanvasRenderingContext2D;
        this.properties = {
            width: canvas.width,
            height: canvas.height
        };

        this.boids = []
        while (this.boids.length < num_boids) {
            this.boids.push(new Boid(
                (Math.random() * 0.8 + 0.1) * this.properties.width,
                (Math.random() * 0.8 + 0.1) * this.properties.height,
                1, Math.random() * 2 * Math.PI, this.properties));
        }
    }

    drawBoids() {
        this.context.clearRect(0, 0, canvas.width, canvas.height);

        for (let boid of this.boids) {
            boid.draw(this.context);
        }
    }

    moveBoids() {
        for (let boid of this.boids) {
            boid.x += boid.speed * Math.cos(boid.direction);
            boid.y += boid.speed * Math.sin(boid.direction);
        }
    }   
    
    updateBoids() {
        for (let boid of this.boids) {
            boid.update();
        }
    }
}

let canvas = document.getElementsByTagName("canvas")[0];
canvas.width = 1000;
canvas.height = 800;    

const world = new World(canvas, 10);
world.drawBoids();

function cycle() {
    world.updateBoids();
    world.moveBoids();
    world.drawBoids();

    window.requestAnimationFrame(cycle)
}

cycle();
