import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

class GardenGame {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        
        // Movement state
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.sprint = false;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.prevTime = performance.now();

        // Jump physics
        this.canJump = true;
        this.isJumping = false;
        this.jumpVelocity = 0;
        this.gravity = 9.81; // m/s²
        this.jumpHeight = 0.5; // meters
        this.initialJumpVelocity = Math.sqrt(2 * this.gravity * this.jumpHeight);

        // Inventory system
        this.inventory = {
            corn: { count: 5, icon: '🌽', name: 'Corn Seeds' },
            tomato: { count: 5, icon: '🍅', name: 'Tomato Seeds' },
            melon: { count: 5, icon: '🍈', name: 'Melon Seeds' },
            strawberry: { count: 5, icon: '🍓', name: 'Strawberry Seeds' }
        };
        this.inventoryVisible = false;

        // Game state
        this.isPlaying = false;

        // Obstacles
        this.obstacles = [];

        this.init();
        this.setupScene();
        this.setupControls();
        this.setupUI();
        this.setupInventoryUI();
        this.createObstacles();
        this.animate();
    }

    init() {
        // Setup renderer
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        document.body.appendChild(this.renderer.domElement);

        // Setup camera initial position
        this.camera.position.set(0, 1.7, 0); // Average human height in meters
        
        // Add sky
        const skyColor = new THREE.Color(0x87CEEB);
        const groundColor = new THREE.Color(0x558833);
        const hemisphereLight = new THREE.HemisphereLight(skyColor, groundColor, 1);
        this.scene.add(hemisphereLight);
        
        // Create a more realistic sky gradient
        const verticalFogColor = new THREE.Color(0x87CEEB);
        this.scene.background = verticalFogColor;
        this.scene.fog = new THREE.FogExp2(verticalFogColor, 0.008);

        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    setupControls() {
        this.controls = new PointerLockControls(this.camera, document.body);

        // Setup click to start
        const blocker = document.createElement('div');
        blocker.id = 'blocker';
        blocker.style.position = 'fixed';
        blocker.style.top = '0';
        blocker.style.left = '0';
        blocker.style.width = '100%';
        blocker.style.height = '100%';
        blocker.style.backgroundColor = 'rgba(0,0,0,0.7)';
        blocker.style.display = 'flex';
        blocker.style.justifyContent = 'center';
        blocker.style.alignItems = 'center';
        blocker.style.color = 'white';
        blocker.style.fontSize = '32px';
        blocker.style.cursor = 'pointer';
        blocker.style.zIndex = '9999';
        blocker.style.fontFamily = 'Arial, sans-serif';
        blocker.style.userSelect = 'none';
        blocker.innerHTML = '<div style="padding: 20px; background-color: rgba(0,0,0,0.8); border-radius: 10px;">Click to play</div>';
        document.body.appendChild(blocker);

        blocker.addEventListener('click', () => {
            if (!this.inventoryVisible) {
                this.controls.lock();
            }
        });

        this.controls.addEventListener('lock', () => {
            blocker.style.display = 'none';
            this.isPlaying = true;
        });

        this.controls.addEventListener('unlock', () => {
            if (!this.inventoryVisible) {
                blocker.style.display = 'flex';
                this.isPlaying = false;
            }
        });

        // Handle clicking on obstacles
        const onClick = () => {
            if (!this.isPlaying || this.inventoryVisible) return;

            // Create a raycaster
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(), this.camera);

            // Check for intersections with obstacles
            const intersects = raycaster.intersectObjects(this.obstacles, true);
            
            if (intersects.length > 0) {
                // Find the root obstacle (either the rock or the tree group)
                let obstacle = intersects[0].object;
                while (obstacle.parent && !obstacle.userData.type) {
                    obstacle = obstacle.parent;
                }
                
                if (obstacle.userData.type) {
                    this.damageObstacle(obstacle);
                }
            }
        };

        document.addEventListener('click', onClick);

        // Setup movement controls
        const onKeyDown = (event) => {
            switch (event.code) {
                case 'ArrowUp':
                case 'KeyW':
                    this.moveForward = true;
                    break;
                case 'ArrowDown':
                case 'KeyS':
                    this.moveBackward = true;
                    break;
                case 'ArrowLeft':
                case 'KeyA':
                    this.moveLeft = true;
                    break;
                case 'ArrowRight':
                case 'KeyD':
                    this.moveRight = true;
                    break;
                case 'ShiftLeft':
                    this.sprint = true;
                    break;
                case 'Space':
                    if (this.canJump) {
                        this.jumpVelocity = this.initialJumpVelocity;
                        this.canJump = false;
                        this.isJumping = true;
                    }
                    break;
                case 'Digit1':
                    document.querySelectorAll('#toolbar div')[0]?.click();
                    break;
                case 'Digit2':
                    document.querySelectorAll('#toolbar div')[1]?.click();
                    break;
                case 'Digit3':
                    document.querySelectorAll('#toolbar div')[2]?.click();
                    break;
                case 'KeyI':
                    this.toggleInventory();
                    break;
                case 'Escape':
                    if (this.inventoryVisible) {
                        this.toggleInventory();
                    }
                    break;
            }
        };

        const onKeyUp = (event) => {
            switch (event.code) {
                case 'ArrowUp':
                case 'KeyW':
                    this.moveForward = false;
                    break;
                case 'ArrowDown':
                case 'KeyS':
                    this.moveBackward = false;
                    break;
                case 'ArrowLeft':
                case 'KeyA':
                    this.moveLeft = false;
                    break;
                case 'ArrowRight':
                case 'KeyD':
                    this.moveRight = false;
                    break;
                case 'ShiftLeft':
                    this.sprint = false;
                    break;
            }
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
    }

    setupScene() {
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        this.scene.add(ambientLight);

        // Add directional light (sun)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(50, 50, 0);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        this.scene.add(directionalLight);

        // Add ground plane
        const groundSize = 100;
        const groundSegments = 100;
        const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x558833,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide
        });

        // Create ground mesh
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Add textured ground overlay for more detail
        const detailGroundGeometry = new THREE.PlaneGeometry(groundSize, groundSize, groundSegments, groundSegments);
        const detailGroundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x558833,
            roughness: 1,
            metalness: 0,
            side: THREE.DoubleSide
        });

        const detailGround = new THREE.Mesh(detailGroundGeometry, detailGroundMaterial);
        detailGround.rotation.x = -Math.PI / 2;
        detailGround.position.y = 0.01; // Slightly above the base ground
        detailGround.receiveShadow = true;

        // Add subtle ground variation with smoother transitions
        const vertices = detailGroundGeometry.attributes.position.array;
        for (let i = 0; i <= groundSegments; i++) {
            for (let j = 0; j <= groundSegments; j++) {
                const index = (i * (groundSegments + 1) + j) * 3 + 1; // Y coordinate
                vertices[index] = (Math.cos(i * 0.3) * Math.sin(j * 0.3) * 0.2) +
                                (Math.sin(i * 0.7) * Math.cos(j * 0.7) * 0.1);
            }
        }
        
        detailGroundGeometry.computeVertexNormals();
        this.scene.add(detailGround);

        // Add grid helper (matching ground size)
        const gridHelper = new THREE.GridHelper(groundSize, groundSize, 0x000000, 0x000000);
        gridHelper.material.opacity = 0.2;
        gridHelper.material.transparent = true;
        gridHelper.position.y = 0.02; // Slightly above the detail ground
        this.scene.add(gridHelper);
    }

    setupUI() {
        // Create toolbar container
        const toolbar = document.createElement('div');
        toolbar.style.position = 'fixed';
        toolbar.style.bottom = '20px';
        toolbar.style.left = '50%';
        toolbar.style.transform = 'translateX(-50%)';
        toolbar.style.display = 'flex';
        toolbar.style.gap = '10px';
        toolbar.style.padding = '10px';
        toolbar.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        toolbar.style.borderRadius = '10px';
        toolbar.style.zIndex = '1000';

        // Create tools
        const tools = [
            { name: 'Axe', icon: '🪓' },
            { name: 'Hoe', icon: '⛏️' },
            { name: 'Water', icon: '💧' }
        ];

        tools.forEach((tool, index) => {
            const toolElement = document.createElement('div');
            toolElement.style.width = '50px';
            toolElement.style.height = '50px';
            toolElement.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            toolElement.style.border = '2px solid rgba(255, 255, 255, 0.3)';
            toolElement.style.borderRadius = '8px';
            toolElement.style.display = 'flex';
            toolElement.style.justifyContent = 'center';
            toolElement.style.alignItems = 'center';
            toolElement.style.fontSize = '24px';
            toolElement.style.cursor = 'pointer';
            toolElement.style.transition = 'all 0.2s';
            toolElement.innerHTML = tool.icon;
            toolElement.title = tool.name;

            // Highlight first tool by default
            if (index === 0) {
                toolElement.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                toolElement.style.border = '2px solid rgba(255, 255, 255, 0.5)';
            }

            toolElement.addEventListener('click', () => {
                // Remove highlight from all tools
                toolbar.querySelectorAll('div').forEach(el => {
                    el.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    el.style.border = '2px solid rgba(255, 255, 255, 0.3)';
                });
                // Highlight selected tool
                toolElement.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                toolElement.style.border = '2px solid rgba(255, 255, 255, 0.5)';
            });

            toolbar.appendChild(toolElement);
        });

        document.body.appendChild(toolbar);
    }

    setupInventoryUI() {
        // Create inventory container
        const inventory = document.createElement('div');
        inventory.id = 'inventory';
        inventory.style.position = 'fixed';
        inventory.style.top = '50%';
        inventory.style.left = '50%';
        inventory.style.transform = 'translate(-50%, -50%)';
        inventory.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        inventory.style.padding = '20px';
        inventory.style.borderRadius = '10px';
        inventory.style.display = 'none';
        inventory.style.zIndex = '2000';
        inventory.style.minWidth = '300px';
        inventory.style.color = 'white';
        inventory.style.fontFamily = 'Arial, sans-serif';

        // Add inventory title
        const title = document.createElement('div');
        title.style.fontSize = '24px';
        title.style.marginBottom = '15px';
        title.style.textAlign = 'center';
        title.style.borderBottom = '2px solid rgba(255, 255, 255, 0.3)';
        title.style.paddingBottom = '10px';
        title.textContent = 'Inventory';
        inventory.appendChild(title);

        // Create grid container for items
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        grid.style.gap = '10px';
        grid.style.marginTop = '10px';

        // Add items to grid
        Object.entries(this.inventory).forEach(([itemId, item]) => {
            const itemElement = document.createElement('div');
            itemElement.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            itemElement.style.padding = '10px';
            itemElement.style.borderRadius = '5px';
            itemElement.style.display = 'flex';
            itemElement.style.alignItems = 'center';
            itemElement.style.gap = '10px';
            itemElement.style.cursor = 'pointer';
            itemElement.style.transition = 'all 0.2s';

            const icon = document.createElement('span');
            icon.style.fontSize = '24px';
            icon.textContent = item.icon;

            const details = document.createElement('div');
            details.style.flex = '1';

            const name = document.createElement('div');
            name.textContent = item.name;
            name.style.fontSize = '14px';

            const count = document.createElement('div');
            count.textContent = `Quantity: ${item.count}`;
            count.style.fontSize = '12px';
            count.style.opacity = '0.7';
            count.dataset.itemId = itemId;

            details.appendChild(name);
            details.appendChild(count);

            itemElement.appendChild(icon);
            itemElement.appendChild(details);

            // Hover effect
            itemElement.addEventListener('mouseenter', () => {
                itemElement.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            });
            itemElement.addEventListener('mouseleave', () => {
                itemElement.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            });

            grid.appendChild(itemElement);
        });

        inventory.appendChild(grid);

        // Add close button
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.style.marginTop = '20px';
        closeButton.style.padding = '8px 16px';
        closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        closeButton.style.border = 'none';
        closeButton.style.borderRadius = '5px';
        closeButton.style.color = 'white';
        closeButton.style.cursor = 'pointer';
        closeButton.style.width = '100%';
        closeButton.style.transition = 'all 0.2s';

        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
        });
        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        });

        closeButton.addEventListener('click', () => this.toggleInventory());
        inventory.appendChild(closeButton);

        document.body.appendChild(inventory);
    }

    toggleInventory() {
        this.inventoryVisible = !this.inventoryVisible;
        const inventory = document.getElementById('inventory');
        
        if (this.inventoryVisible) {
            // Show inventory and cursor
            inventory.style.display = 'block';
            this.controls.unlock();
            document.body.style.cursor = 'default';
            // Hide the blocker when in inventory
            document.getElementById('blocker').style.display = 'none';
        } else {
            // Hide inventory and return to game
            inventory.style.display = 'none';
            document.body.style.cursor = 'none';
            if (this.isPlaying) {
                this.controls.lock();
            }
        }
    }

    updateInventoryDisplay() {
        Object.entries(this.inventory).forEach(([itemId, item]) => {
            const countElement = document.querySelector(`[data-item-id="${itemId}"]`);
            if (countElement) {
                countElement.textContent = `Quantity: ${item.count}`;
            }
        });
    }

    updateMovement() {
        // Only update movement if playing and not in inventory
        if (!this.controls.isLocked || this.inventoryVisible) return;

        const time = performance.now();
        const delta = (time - this.prevTime) / 1000;

        // Update horizontal movement
        this.velocity.x -= this.velocity.x * 10.0 * delta;
        this.velocity.z -= this.velocity.z * 10.0 * delta;

        this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
        this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
        this.direction.normalize();

        const walkingSpeed = 2.0;
        const currentSpeed = this.sprint ? walkingSpeed * 3 : walkingSpeed;

        if (this.moveForward || this.moveBackward) {
            this.velocity.z -= this.direction.z * currentSpeed * delta * 20;
        }
        if (this.moveLeft || this.moveRight) {
            this.velocity.x -= this.direction.x * currentSpeed * delta * 20;
        }

        // Update vertical movement (jumping)
        if (this.isJumping) {
            this.jumpVelocity -= this.gravity * delta;
            this.camera.position.y += this.jumpVelocity * delta;

            // Check if we've landed
            if (this.camera.position.y <= 1.7) {
                this.camera.position.y = 1.7;
                this.isJumping = false;
                this.canJump = true;
                this.jumpVelocity = 0;
            }
        }

        this.controls.moveRight(-this.velocity.x * delta);
        this.controls.moveForward(-this.velocity.z * delta);

        this.prevTime = time;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.updateMovement();
        this.renderer.render(this.scene, this.camera);
    }

    createObstacles() {
        // Create trees
        for (let i = 0; i < 10; i++) {
            const x = (Math.random() - 0.5) * 80;
            const z = (Math.random() - 0.5) * 80;
            this.createTree(x, z);
        }

        // Create rocks
        for (let i = 0; i < 5; i++) {
            const x = (Math.random() - 0.5) * 80;
            const z = (Math.random() - 0.5) * 80;
            this.createRock(x, z);
        }
    }

    createTree(x, z) {
        // Create tree trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 2, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.2
        });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.set(x, 1, z);
        trunk.castShadow = true;
        trunk.receiveShadow = true;

        // Create leaves
        const leavesGeometry = new THREE.SphereGeometry(1, 8, 8);
        const leavesMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x228B22,
            roughness: 1,
            metalness: 0
        });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.set(x, 2.5, z);
        leaves.castShadow = true;
        leaves.receiveShadow = true;

        // Group the tree parts
        const treeGroup = new THREE.Group();
        treeGroup.add(trunk);
        treeGroup.add(leaves);
        
        // Add metadata
        treeGroup.userData.type = 'tree';
        treeGroup.userData.health = 7; // Trees take 7 hits to break

        this.scene.add(treeGroup);
        this.obstacles.push(treeGroup);
    }

    createRock(x, z) {
        // Create rock
        const rockGeometry = new THREE.DodecahedronGeometry(0.8, 1);
        const rockMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x808080,
            roughness: 0.9,
            metalness: 0.1
        });
        const rock = new THREE.Mesh(rockGeometry, rockMaterial);
        rock.position.set(x, 0.4, z);
        rock.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );
        rock.castShadow = true;
        rock.receiveShadow = true;

        // Add metadata
        rock.userData.type = 'rock';
        rock.userData.health = 3; // Rocks take 3 hits to break

        this.scene.add(rock);
        this.obstacles.push(rock);
    }

    damageObstacle(obstacle) {
        // Decrease health
        obstacle.userData.health--;

        // Visual feedback based on type
        if (obstacle.userData.type === 'tree') {
            // Change leaf color based on damage
            const leaves = obstacle.children[1];
            const damageColor = new THREE.Color(0x228B22); // Start with healthy green
            damageColor.lerp(new THREE.Color(0x654321), 1 - (obstacle.userData.health / 7));
            leaves.material.color = damageColor;
        } else if (obstacle.userData.type === 'rock') {
            // Scale rock based on damage
            const scale = 0.7 + (obstacle.userData.health * 0.1);
            obstacle.scale.set(scale, scale, scale);
        }

        // Remove if destroyed
        if (obstacle.userData.health <= 0) {
            this.scene.remove(obstacle);
            const index = this.obstacles.indexOf(obstacle);
            if (index > -1) {
                this.obstacles.splice(index, 1);
            }
        }
    }
}

// Start the game
new GardenGame(); 