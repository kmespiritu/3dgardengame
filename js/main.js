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

        // Game objects
        this.obstacles = [];
        this.selectedTool = 'Axe';
        this.groundSize = 100;
        this.tileSize = 1;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Interactable objects
        this.interactables = new Map();

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
        this.mailboxVisible = false;

        // Game state
        this.isPlaying = false;
        this.savedGames = JSON.parse(localStorage.getItem('gardenGameSaves') || '{}');

        // Cursor highlight
        this.cursorHighlight = null;
        this.gridSize = 1; // Size of each grid square

        // Plant system
        this.plants = new Map(); // Store plants and their states
        this.selectedSeed = null;
        this.wateringCount = new Map(); // Track watering for each plant
        this.tilledSoil = new Map(); // Track tilled soil locations
        this.seedTooltip = null; // Add tooltip reference

        this.init();
        this.setupScene();
        this.setupControls();
        this.setupUI();
        this.setupInventoryUI();
        this.createObstacles();
        this.createCursorHighlight();
        this.createLogCabin();
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
            if (!this.inventoryVisible && !this.mailboxVisible) {
                this.controls.lock();
            }
        });

        this.controls.addEventListener('lock', () => {
            blocker.style.display = 'none';
            this.isPlaying = true;
        });

        this.controls.addEventListener('unlock', () => {
            if (!this.inventoryVisible && !this.mailboxVisible) {
                blocker.style.display = 'flex';
                this.isPlaying = false;
            }
        });

        // Handle clicking for all interactions
        const handleClick = () => {
            if (!this.isPlaying || this.inventoryVisible || this.mailboxVisible) return; // Early return if inventory or mailbox is open

            // Check for mailbox interaction first
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(), this.camera);
            
            // Check interactables first
            for (const [_, interactable] of this.interactables) {
                const intersects = raycaster.intersectObject(interactable, true);
                if (intersects.length > 0 && intersects[0].distance <= 5) {
                    let object = intersects[0].object;
                    while (object.parent && !object.userData.interactable) {
                        object = object.parent;
                    }
                    if (object.userData.interactable) {
                        object.userData.action();
                        return;
                    }
                }
            }

            const gridPosition = this.getGridPosition();
            if (!gridPosition) return;

            const key = `${gridPosition.x},${gridPosition.z}`;
            
            // Handle planting if a seed is selected
            if (this.selectedSeed && this.tilledSoil.has(key) && !this.plants.has(key)) {
                this.plantSeed(key, gridPosition);
                return; // Return after planting to prevent other actions
            }

            switch (this.selectedTool) {
                case 'hoe':
                    this.tillSoil(key, gridPosition);
                    break;
                case 'water':
                    this.waterPlant(key);
                    break;
                case 'axe':
                    // Handle obstacle interaction
                    const obstacleIntersects = raycaster.intersectObjects(this.obstacles, true);
                    if (obstacleIntersects.length > 0) {
                        let obstacle = obstacleIntersects[0].object;
                        while (obstacle.parent && !obstacle.userData.type) {
                            obstacle = obstacle.parent;
                        }
                        if (obstacle.userData.type) {
                            this.damageObstacle(obstacle);
                        }
                    }
                    break;
            }

            // Handle harvesting
            if (this.plants.has(key) && this.plants.get(key).isHarvestable) {
                this.harvestPlant(key);
            }
        };

        document.addEventListener('click', handleClick);

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
        const groundSize = this.groundSize;
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
        detailGround.position.y = 0.01;
        detailGround.receiveShadow = true;

        // Add subtle ground variation
        const vertices = detailGroundGeometry.attributes.position.array;
        for (let i = 0; i <= groundSegments; i++) {
            for (let j = 0; j <= groundSegments; j++) {
                const index = (i * (groundSegments + 1) + j) * 3 + 1;
                vertices[index] = (Math.cos(i * 0.3) * Math.sin(j * 0.3) * 0.2) +
                                (Math.sin(i * 0.7) * Math.cos(j * 0.7) * 0.1);
            }
        }
        
        detailGroundGeometry.computeVertexNormals();
        this.scene.add(detailGround);

        // Add grid helper
        const gridHelper = new THREE.GridHelper(groundSize, groundSize, 0x000000, 0x000000);
        gridHelper.material.opacity = 0.2;
        gridHelper.material.transparent = true;
        gridHelper.position.y = 0.02;
        this.scene.add(gridHelper);

        // Create and place obstacles
        this.createObstacles();
    }

    createTree(x, z) {
        // Create tree trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 2, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.set(x, 1, z);
        trunk.castShadow = true;
        trunk.receiveShadow = true;

        // Create tree top (leaves)
        const leavesGeometry = new THREE.ConeGeometry(1, 2, 8);
        const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x2D5A27 });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.set(0, 1.5, 0);
        leaves.castShadow = true;
        trunk.add(leaves);

        trunk.userData = { type: 'tree' };
        return trunk;
    }

    createRock(x, z) {
        // Create rock
        const rockGeometry = new THREE.DodecahedronGeometry(0.5);
        const rockMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x808080,
            roughness: 0.8,
            metalness: 0.2
        });
        const rock = new THREE.Mesh(rockGeometry, rockMaterial);
        rock.position.set(x, 0.5, z);
        rock.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );
        rock.castShadow = true;
        rock.receiveShadow = true;
        rock.userData = { type: 'rock' };
        return rock;
    }

    createObstacles() {
        const totalTiles = (this.groundSize / this.tileSize) * (this.groundSize / this.tileSize);
        const obstacleCount = Math.floor(totalTiles * 0.02); // 2% of tiles
        const halfGroundSize = this.groundSize / 2;

        for (let i = 0; i < obstacleCount; i++) {
            // Random position within ground bounds
            const x = (Math.random() * this.groundSize) - halfGroundSize;
            const z = (Math.random() * this.groundSize) - halfGroundSize;

            // Create either a tree or rock
            const obstacle = Math.random() < 0.7 ? this.createTree(x, z) : this.createRock(x, z);
            this.obstacles.push(obstacle);
            this.scene.add(obstacle);
        }
    }

    setupUI() {
        // Create toolbar container
        const toolbar = document.createElement('div');
        toolbar.id = 'toolbar';
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
            { name: 'Axe', icon: '🪓', type: 'axe' },
            { name: 'Hoe', icon: '⛏️', type: 'hoe' },
            { name: 'Water', icon: '💧', type: 'water' }
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
            toolElement.dataset.toolType = tool.type;

            // Highlight first tool by default
            if (index === 0) {
                toolElement.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                toolElement.style.border = '2px solid rgba(255, 255, 255, 0.5)';
                this.selectedTool = tool.type;
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
                this.selectedTool = tool.type;
            });

            toolbar.appendChild(toolElement);
        });

        document.body.appendChild(toolbar);

        // Add click event listener for removing obstacles
        document.addEventListener('click', (event) => {
            if (!this.controls.isLocked || this.inventoryVisible) return;

            // Calculate mouse position
            this.mouse.x = 0;
            this.mouse.y = 0;

            // Update the picking ray with the camera and mouse position
            this.raycaster.setFromCamera(this.mouse, this.camera);

            // Calculate objects intersecting the picking ray
            const intersects = this.raycaster.intersectObjects(this.obstacles);

            if (intersects.length > 0 && this.selectedTool === 'Axe') {
                const obstacle = intersects[0].object;
                if (intersects[0].distance <= 5) { // Only remove if within range
                    this.scene.remove(obstacle);
                    this.obstacles = this.obstacles.filter(obj => obj !== obstacle);
                }
            }
        });

        // Create seed tooltip
        const seedTooltip = document.createElement('div');
        seedTooltip.style.position = 'fixed';
        seedTooltip.style.bottom = '20px';
        seedTooltip.style.left = '20px';
        seedTooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        seedTooltip.style.color = 'white';
        seedTooltip.style.padding = '10px';
        seedTooltip.style.borderRadius = '5px';
        seedTooltip.style.display = 'none';
        seedTooltip.style.zIndex = '1000';
        seedTooltip.style.fontFamily = 'Arial, sans-serif';
        document.body.appendChild(seedTooltip);
        this.seedTooltip = seedTooltip;
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

            // Add click handler for seed selection
            itemElement.addEventListener('click', () => {
                this.selectedSeed = itemId;
                // Update visual feedback
                grid.querySelectorAll('div').forEach(el => {
                    el.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                });
                itemElement.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            });

            // Hover effect
            itemElement.addEventListener('mouseenter', () => {
                itemElement.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            });
            itemElement.addEventListener('mouseleave', () => {
                itemElement.style.backgroundColor = this.selectedSeed === itemId ? 
                    'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)';
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
            this.updateSeedTooltip(); // Update tooltip when closing inventory
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
        this.updateCursorHighlight();
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
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
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

    createCursorHighlight() {
        // Create a cross marker geometry
        const markerGeometry = new THREE.BufferGeometry();
        const size = 0.5; // Size of the X marker
        
        // Create an X shape
        const positions = new Float32Array([
            -size, 0, -size,  // First line of X
            size, 0, size,
            -size, 0, size,   // Second line of X
            size, 0, -size
        ]);
        
        markerGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const markerMaterial = new THREE.LineBasicMaterial({ 
            color: 0xff0000,
            transparent: true,
            opacity: 0.7
        });
        
        // Create two line segments forming an X
        this.cursorHighlight = new THREE.LineSegments(markerGeometry, markerMaterial);
        this.cursorHighlight.visible = false;
        this.scene.add(this.cursorHighlight);
    }

    updateCursorHighlight() {
        if (!this.isPlaying || this.inventoryVisible) {
            if (this.cursorHighlight) this.cursorHighlight.visible = false;
            return;
        }

        // Create raycaster
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(), this.camera);

        // Check intersection with ground
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectionPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(groundPlane, intersectionPoint);

        // Snap to grid
        const snappedX = Math.round(intersectionPoint.x / this.gridSize) * this.gridSize;
        const snappedZ = Math.round(intersectionPoint.z / this.gridSize) * this.gridSize;

        // Update marker position
        if (this.cursorHighlight) {
            this.cursorHighlight.position.set(snappedX, 0.01, snappedZ);
            this.cursorHighlight.visible = true;
        }
    }

    getGridPosition() {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(), this.camera);

        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectionPoint = new THREE.Vector3();
        
        if (raycaster.ray.intersectPlane(groundPlane, intersectionPoint)) {
            return {
                x: Math.round(intersectionPoint.x / this.gridSize) * this.gridSize,
                z: Math.round(intersectionPoint.z / this.gridSize) * this.gridSize
            };
        }
        return null;
    }

    tillSoil(key, position) {
        if (this.tilledSoil.has(key)) return;

        // Create tilled soil visual
        const soilGeometry = new THREE.PlaneGeometry(0.8, 0.8);
        const soilMaterial = new THREE.MeshStandardMaterial({
            color: 0x3d2817,
            roughness: 1,
            metalness: 0
        });
        const soil = new THREE.Mesh(soilGeometry, soilMaterial);
        soil.rotation.x = -Math.PI / 2;
        soil.position.set(position.x, 0.01, position.z);
        this.scene.add(soil);

        this.tilledSoil.set(key, soil);
    }

    plantSeed(key, position) {
        if (this.plants.has(key) || !this.inventory[this.selectedSeed] || 
            this.inventory[this.selectedSeed].count <= 0) return;

        // Create initial plant visual (small sprout)
        const plantGeometry = new THREE.ConeGeometry(0.1, 0.2, 8);
        const plantMaterial = new THREE.MeshStandardMaterial({
            color: 0x90EE90, // Light green
            roughness: 1,
            metalness: 0
        });
        const plant = new THREE.Mesh(plantGeometry, plantMaterial);
        plant.position.set(position.x, 0.1, position.z);
        this.scene.add(plant);

        // Store plant data
        this.plants.set(key, {
            mesh: plant,
            type: this.selectedSeed,
            growth: 0,
            waterCount: 0,
            isHarvestable: false
        });

        // Decrease seed count
        this.inventory[this.selectedSeed].count--;
        this.updateInventoryDisplay();
        this.updateSeedTooltip();
    }

    waterPlant(key) {
        if (!this.plants.has(key)) return;

        const plant = this.plants.get(key);
        if (plant.waterCount >= 3 || plant.isHarvestable) return;

        // Increment water count
        plant.waterCount++;
        
        // Update growth stage
        this.growPlant(key, plant);

        // Visual feedback for watering
        this.createWaterEffect(plant.mesh.position);
    }

    createWaterEffect(position) {
        const particles = new THREE.Points(
            new THREE.BufferGeometry(),
            new THREE.PointsMaterial({
                color: 0x00ffff,
                size: 0.05,
                transparent: true,
                opacity: 0.6
            })
        );

        const particleCount = 20;
        const positions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = position.x + (Math.random() - 0.5) * 0.5;
            positions[i * 3 + 1] = position.y + Math.random() * 0.5;
            positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.5;
        }

        particles.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.scene.add(particles);

        // Remove particles after animation
        setTimeout(() => {
            this.scene.remove(particles);
        }, 1000);
    }

    growPlant(key, plant) {
        const growthStep = plant.waterCount / 3;
        
        // Remove existing plant mesh
        this.scene.remove(plant.mesh);
        
        // Create new plant group
        const group = new THREE.Group();
        
        switch (plant.type) {
            case 'tomato':
                if (growthStep === 1) {
                    // Final stage - full tomato plant
                    this.createTomatoPlant(plant);
                } else {
                    // Growing stages - stem gets taller, leaves appear, then tomatoes
                    const stemHeight = 0.3 + (growthStep * 0.7);
                    const stemGeometry = new THREE.CylinderGeometry(0.03, 0.05, stemHeight, 8);
                    const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
                    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
                    stem.position.y = stemHeight/2;
                    group.add(stem);

                    // Add leaves after first watering
                    if (growthStep > 0.33) {
                        const leafGeometry = new THREE.PlaneGeometry(0.15, 0.2);
                        const leafMaterial = new THREE.MeshStandardMaterial({ 
                            color: 0x228B22,
                            side: THREE.DoubleSide
                        });
                        
                        for (let i = 0; i < 2; i++) {
                            const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
                            leaf.position.set(
                                Math.sin(i * Math.PI) * 0.1,
                                stemHeight * 0.6,
                                Math.cos(i * Math.PI) * 0.1
                            );
                            leaf.rotation.set(Math.PI/6, i * Math.PI, 0);
                            group.add(leaf);
                        }
                    }
                }
                break;
                
            case 'corn':
                if (growthStep === 1) {
                    // Final stage - full corn plant
                    this.createCornPlant(plant);
                } else {
                    // Growing stages - tall thin stalk that grows taller
                    const stalkHeight = 0.5 + (growthStep * 1.5);
                    const stalkGeometry = new THREE.CylinderGeometry(0.03, 0.05, stalkHeight, 8);
                    const stalkMaterial = new THREE.MeshStandardMaterial({ color: 0x90EE90 });
                    const stalk = new THREE.Mesh(stalkGeometry, stalkMaterial);
                    stalk.position.y = stalkHeight/2;
                    group.add(stalk);

                    // Add leaves after first watering
                    if (growthStep > 0.33) {
                        const leafGeometry = new THREE.PlaneGeometry(0.1 + growthStep * 0.2, 0.4);
                        const leafMaterial = new THREE.MeshStandardMaterial({ 
                            color: 0x90EE90,
                            side: THREE.DoubleSide
                        });
                        
                        for (let i = 0; i < 3; i++) {
                            const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
                            leaf.position.set(
                                0,
                                stalkHeight * (0.3 + i * 0.2),
                                0
                            );
                            leaf.rotation.set(0, i * Math.PI/1.5, Math.PI/6);
                            group.add(leaf);
                        }
                    }
                }
                break;
                
            case 'melon':
                if (growthStep === 1) {
                    // Final stage - full melon plant
                    this.createMelonPlant(plant);
                } else {
                    // Growing stages - spreading vines with small leaves
                    const vineLength = 0.2 + (growthStep * 0.3);
                    const vineGeometry = new THREE.CylinderGeometry(0.02, 0.02, vineLength, 8);
                    const vineMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
                    
                    // Create multiple vine segments
                    for (let i = 0; i < 3; i++) {
                        const vine = new THREE.Mesh(vineGeometry, vineMaterial);
                        vine.position.set(
                            Math.sin(i * Math.PI * 2/3) * vineLength * 0.7,
                            0.05,
                            Math.cos(i * Math.PI * 2/3) * vineLength * 0.7
                        );
                        vine.rotation.z = Math.PI/2;
                        vine.rotation.y = i * Math.PI * 2/3;
                        group.add(vine);

                        // Add leaves after first watering
                        if (growthStep > 0.33) {
                            const leafGeometry = new THREE.CircleGeometry(0.1 + growthStep * 0.1, 5);
                            const leafMaterial = new THREE.MeshStandardMaterial({ 
                                color: 0x228B22,
                                side: THREE.DoubleSide
                            });
                            const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
                            leaf.position.copy(vine.position);
                            leaf.position.y = 0.02;
                            leaf.rotation.x = -Math.PI/2;
                            group.add(leaf);
                        }
                    }
                }
                break;
                
            case 'strawberry':
                if (growthStep === 1) {
                    // Final stage - full strawberry plant
                    this.createStrawberryPlant(plant);
                } else {
                    // Growing stages - low spreading leaves, then berries
                    const baseGeometry = new THREE.SphereGeometry(0.1 + growthStep * 0.1, 8, 8);
                    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
                    const base = new THREE.Mesh(baseGeometry, baseMaterial);
                    base.position.y = 0.1;
                    base.scale.set(1, 0.3, 1);
                    group.add(base);

                    // Add leaves after first watering
                    if (growthStep > 0.33) {
                        const leafCount = Math.floor(2 + growthStep * 4);
                        const leafGeometry = new THREE.CircleGeometry(0.1, 3);
                        const leafMaterial = new THREE.MeshStandardMaterial({ 
                            color: 0x228B22,
                            side: THREE.DoubleSide
                        });
                        
                        for (let i = 0; i < leafCount; i++) {
                            const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
                            leaf.position.set(
                                Math.sin(i * Math.PI * 2/leafCount) * 0.15,
                                0.05,
                                Math.cos(i * Math.PI * 2/leafCount) * 0.15
                            );
                            leaf.rotation.x = -Math.PI/2;
                            leaf.rotation.z = i * Math.PI * 2/leafCount;
                            group.add(leaf);
                        }
                    }
                }
                break;
        }

        // Position the group at the plant's location
        if (plant.mesh.position) {
            group.position.copy(plant.mesh.position);
        }
        
        // Update the plant's mesh reference
        this.scene.add(group);
        plant.mesh = group;

        // Mark as harvestable when fully grown
        if (growthStep === 1) {
            plant.isHarvestable = true;
        }
    }

    createTomatoPlant(plant) {
        // Remove the original sprout
        this.scene.remove(plant.mesh);
        
        // Create plant group
        const group = new THREE.Group();
        
        // Create stem
        const stemGeometry = new THREE.CylinderGeometry(0.05, 0.08, 1, 8);
        const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.y = 0.5;
        group.add(stem);
        
        // Create tomatoes
        const tomatoGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const tomatoMaterial = new THREE.MeshStandardMaterial({ color: 0xFF6347 });
        
        // Add multiple tomatoes
        for (let i = 0; i < 3; i++) {
            const tomato = new THREE.Mesh(tomatoGeometry, tomatoMaterial);
            tomato.position.set(
                Math.sin(i * Math.PI * 2/3) * 0.2,
                0.7 + Math.random() * 0.3,
                Math.cos(i * Math.PI * 2/3) * 0.2
            );
            group.add(tomato);
        }
        
        // Add leaves
        const leafGeometry = new THREE.PlaneGeometry(0.2, 0.3);
        const leafMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x228B22,
            side: THREE.DoubleSide
        });
        
        for (let i = 0; i < 4; i++) {
            const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
            leaf.position.set(
                Math.sin(i * Math.PI/2) * 0.2,
                0.3 + Math.random() * 0.4,
                Math.cos(i * Math.PI/2) * 0.2
            );
            leaf.rotation.set(
                Math.random() * Math.PI/4,
                i * Math.PI/2,
                Math.random() * Math.PI/4
            );
            group.add(leaf);
        }
        
        group.position.copy(plant.mesh.position);
        this.scene.add(group);
        plant.mesh = group;
    }

    createCornPlant(plant) {
        // Remove the original sprout
        this.scene.remove(plant.mesh);
        
        // Create plant group
        const group = new THREE.Group();
        
        // Create tall stalk
        const stalkGeometry = new THREE.CylinderGeometry(0.05, 0.08, 2, 8);
        const stalkMaterial = new THREE.MeshStandardMaterial({ color: 0x90EE90 });
        const stalk = new THREE.Mesh(stalkGeometry, stalkMaterial);
        stalk.position.y = 1;
        group.add(stalk);
        
        // Create corn ears
        const cornGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8);
        const cornMaterial = new THREE.MeshStandardMaterial({ color: 0xFFD700 });
        
        // Add two ears of corn
        for (let i = 0; i < 2; i++) {
            const corn = new THREE.Mesh(cornGeometry, cornMaterial);
            corn.position.set(
                Math.sin(i * Math.PI) * 0.2,
                1.2,
                Math.cos(i * Math.PI) * 0.2
            );
            corn.rotation.z = Math.PI/4;
            group.add(corn);
        }
        
        group.position.copy(plant.mesh.position);
        this.scene.add(group);
        plant.mesh = group;
    }

    createMelonPlant(plant) {
        // Remove the original sprout
        this.scene.remove(plant.mesh);
        
        // Create plant group
        const group = new THREE.Group();
        
        // Create vine base
        const vineGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8);
        const vineMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        const vine = new THREE.Mesh(vineGeometry, vineMaterial);
        vine.position.y = 0.15;
        group.add(vine);
        
        // Create melon
        const melonGeometry = new THREE.SphereGeometry(0.25, 12, 12);
        const melonMaterial = new THREE.MeshStandardMaterial({ color: 0x90EE90 });
        const melon = new THREE.Mesh(melonGeometry, melonMaterial);
        melon.position.y = 0.25;
        group.add(melon);
        
        // Add leaves
        const leafGeometry = new THREE.CircleGeometry(0.2, 5);
        const leafMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x228B22,
            side: THREE.DoubleSide
        });
        
        for (let i = 0; i < 3; i++) {
            const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
            leaf.position.set(
                Math.sin(i * Math.PI * 2/3) * 0.3,
                0.05,
                Math.cos(i * Math.PI * 2/3) * 0.3
            );
            leaf.rotation.x = -Math.PI/2;
            group.add(leaf);
        }
        
        group.position.copy(plant.mesh.position);
        this.scene.add(group);
        plant.mesh = group;
    }

    createStrawberryPlant(plant) {
        // Remove the original sprout
        this.scene.remove(plant.mesh);
        
        // Create plant group
        const group = new THREE.Group();
        
        // Create plant base
        const baseGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = 0.2;
        base.scale.set(1, 0.5, 1);
        group.add(base);
        
        // Create strawberries
        const berryGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        const berryMaterial = new THREE.MeshStandardMaterial({ color: 0xFF0000 });
        
        for (let i = 0; i < 4; i++) {
            const berry = new THREE.Mesh(berryGeometry, berryMaterial);
            berry.position.set(
                Math.sin(i * Math.PI/2) * 0.15,
                0.15,
                Math.cos(i * Math.PI/2) * 0.15
            );
            group.add(berry);
        }
        
        group.position.copy(plant.mesh.position);
        this.scene.add(group);
        plant.mesh = group;
    }

    harvestPlant(key) {
        const plant = this.plants.get(key);
        if (!plant || !plant.isHarvestable) return;

        // Add harvested item to inventory
        const harvestedAmount = Math.floor(Math.random() * 3) + 1; // 1-3 items
        this.inventory[plant.type].count += harvestedAmount;
        this.updateInventoryDisplay();

        // Remove plant
        this.scene.remove(plant.mesh);
        this.plants.delete(key);
        this.tilledSoil.delete(key);
    }

    updateSeedTooltip() {
        if (!this.selectedSeed || this.inventoryVisible) {
            this.seedTooltip.style.display = 'none';
            return;
        }

        const item = this.inventory[this.selectedSeed];
        this.seedTooltip.textContent = `Selected: ${item.name} (${item.count} remaining)`;
        this.seedTooltip.style.display = 'block';
    }

    createLogCabin() {
        const cabin = new THREE.Group();
        
        // Create base walls first
        const wallsGeometry = new THREE.BoxGeometry(6, 4, 4);
        const wallsMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            roughness: 0.9,
            metalness: 0.1
        });
        const baseWalls = new THREE.Mesh(wallsGeometry, wallsMaterial);
        baseWalls.position.y = 2;
        cabin.add(baseWalls);

        // Add horizontal logs to all four walls
        const logCount = 8;
        const logSpacing = 4 / logCount;
        const logGeometry = new THREE.CylinderGeometry(0.2, 0.2, 6, 8);
        const logMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            roughness: 0.9,
            metalness: 0.1
        });

        // Front and back walls
        for (let i = 0; i < logCount; i++) {
            // Front wall logs
            const frontLog = new THREE.Mesh(logGeometry, logMaterial);
            frontLog.rotation.z = Math.PI / 2;
            frontLog.position.set(0, i * logSpacing, 2);
            cabin.add(frontLog);

            // Back wall logs
            const backLog = new THREE.Mesh(logGeometry, logMaterial);
            backLog.rotation.z = Math.PI / 2;
            backLog.position.set(0, i * logSpacing, -2);
            cabin.add(backLog);
        }

        // Side walls
        const sideLogGeometry = new THREE.CylinderGeometry(0.2, 0.2, 4, 8);
        for (let i = 0; i < logCount; i++) {
            // Left wall logs
            const leftLog = new THREE.Mesh(sideLogGeometry, logMaterial);
            leftLog.rotation.set(0, Math.PI / 2, Math.PI / 2);
            leftLog.position.set(-3, i * logSpacing, 0);
            cabin.add(leftLog);

            // Right wall logs
            const rightLog = new THREE.Mesh(sideLogGeometry, logMaterial);
            rightLog.rotation.set(0, Math.PI / 2, Math.PI / 2);
            rightLog.position.set(3, i * logSpacing, 0);
            cabin.add(rightLog);
        }

        // Create the roof with shingle texture
        const roofGeometry = new THREE.ConeGeometry(4.5, 2, 4);
        const roofMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x4A2800,
            roughness: 0.8,
            metalness: 0.2,
            // Add shingle pattern
            bumpScale: 0.1
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.y = 5;
        roof.rotation.y = Math.PI / 4; // Rotate 45 degrees to align with square base
        cabin.add(roof);

        // Add a more detailed door with frame
        const doorFrame = new THREE.Group();
        
        const doorGeometry = new THREE.PlaneGeometry(1, 2);
        const doorMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x4A2800,
            roughness: 0.9,
            metalness: 0.2,
            side: THREE.DoubleSide
        });
        const door = new THREE.Mesh(doorGeometry, doorMaterial);
        
        // Add door frame
        const frameGeometry = new THREE.BoxGeometry(1.2, 2.2, 0.1);
        const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const frame = new THREE.Mesh(frameGeometry, frameMaterial);
        
        doorFrame.add(frame);
        doorFrame.add(door);
        doorFrame.position.set(0, 1, 2.01);
        cabin.add(doorFrame);

        // Add windows with frames
        const createWindow = (x) => {
            const windowGroup = new THREE.Group();
            
            // Window frame
            const frameGeometry = new THREE.BoxGeometry(1.2, 1.2, 0.1);
            const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
            const frame = new THREE.Mesh(frameGeometry, frameMaterial);
            
            // Window panes
            const paneGeometry = new THREE.PlaneGeometry(0.5, 0.5);
            const paneMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x87CEEB,
                roughness: 0.3,
                metalness: 0.5,
                opacity: 0.7,
                transparent: true,
                side: THREE.DoubleSide
            });
            
            // Create four panes
            const panePositions = [
                [-0.25, 0.25], [0.25, 0.25],
                [-0.25, -0.25], [0.25, -0.25]
            ];
            
            panePositions.forEach(([px, py]) => {
                const pane = new THREE.Mesh(paneGeometry, paneMaterial);
                pane.position.set(px, py, 0);
                windowGroup.add(pane);
            });
            
            windowGroup.add(frame);
            windowGroup.position.set(x, 2, 2.01);
            return windowGroup;
        };

        cabin.add(createWindow(-1.5));
        cabin.add(createWindow(1.5));

        // Add a chimney
        const chimneyGeometry = new THREE.BoxGeometry(0.6, 2, 0.6);
        const chimneyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            roughness: 1,
            metalness: 0
        });
        const chimney = new THREE.Mesh(chimneyGeometry, chimneyMaterial);
        chimney.position.set(2, 5, 0);
        cabin.add(chimney);

        // Create and add the mailbox
        const mailbox = this.createMailbox();
        mailbox.position.set(4, 0, 2);
        cabin.add(mailbox);

        // Position the cabin near spawn point (no rotation)
        cabin.position.set(8, 0, 8);

        this.scene.add(cabin);
    }

    createMailbox() {
        const mailboxGroup = new THREE.Group();

        // Create the post
        const postGeometry = new THREE.BoxGeometry(0.1, 1.2, 0.1);
        const postMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const post = new THREE.Mesh(postGeometry, postMaterial);
        post.position.y = 0.6;
        mailboxGroup.add(post);

        // Create the mailbox body
        const boxGeometry = new THREE.BoxGeometry(0.4, 0.3, 0.6);
        const boxMaterial = new THREE.MeshStandardMaterial({ color: 0x4A4A4A });
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        box.position.y = 1.2;
        mailboxGroup.add(box);

        // Add interaction data
        mailboxGroup.userData = {
            type: 'mailbox',
            interactable: true,
            action: () => this.openMailboxMenu()
        };

        // Add to interactables
        this.interactables.set('mailbox', mailboxGroup);

        return mailboxGroup;
    }

    openMailboxMenu() {
        this.mailboxVisible = true;
        // Create mailbox menu container
        const menu = document.createElement('div');
        menu.id = 'mailbox-menu';
        menu.style.position = 'fixed';
        menu.style.top = '50%';
        menu.style.left = '50%';
        menu.style.transform = 'translate(-50%, -50%)';
        menu.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
        menu.style.padding = '20px';
        menu.style.borderRadius = '10px';
        menu.style.color = 'white';
        menu.style.zIndex = '1000';
        menu.style.minWidth = '300px';

        // Hide the blocker
        const blocker = document.getElementById('blocker');
        if (blocker) {
            blocker.style.display = 'none';
        }

        // Add title
        const title = document.createElement('div');
        title.style.fontSize = '24px';
        title.style.marginBottom = '15px';
        title.style.textAlign = 'center';
        title.style.borderBottom = '2px solid rgba(255, 255, 255, 0.3)';
        title.style.paddingBottom = '10px';
        title.textContent = 'Mailbox';
        menu.appendChild(title);

        // Add menu options
        const options = [
            { text: 'Save Game', action: () => this.saveGame() },
            { text: 'Load Game', action: () => this.loadGame() },
            { text: 'Messages', action: () => this.openMessages() },
            { text: 'Settings', action: () => this.openSettings() },
            { text: 'Close', action: () => this.closeMailboxMenu() }
        ];

        options.forEach(option => {
            const button = document.createElement('button');
            button.textContent = option.text;
            button.style.display = 'block';
            button.style.width = '100%';
            button.style.padding = '10px';
            button.style.margin = '5px 0';
            button.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            button.style.border = 'none';
            button.style.color = 'white';
            button.style.cursor = 'pointer';
            button.style.borderRadius = '5px';
            button.style.transition = 'background-color 0.2s';
            button.addEventListener('mouseover', () => {
                button.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            });
            button.addEventListener('mouseout', () => {
                button.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            });
            button.onclick = option.action; // Changed to direct assignment for more reliable event handling
            menu.appendChild(button);
        });

        document.body.appendChild(menu);
        this.controls.unlock();
        document.body.style.cursor = 'default';
    }

    closeMailboxMenu() {
        this.mailboxVisible = false;
        const menu = document.getElementById('mailbox-menu');
        if (menu) {
            document.body.removeChild(menu);
            if (this.isPlaying) {
                this.controls.lock();
                document.body.style.cursor = 'none';
            }
        }
    }

    // Placeholder methods for mailbox menu actions
    saveGame() {
        // Create save game dialog
        const saveDialog = document.createElement('div');
        saveDialog.style.position = 'fixed';
        saveDialog.style.top = '50%';
        saveDialog.style.left = '50%';
        saveDialog.style.transform = 'translate(-50%, -50%)';
        saveDialog.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
        saveDialog.style.padding = '20px';
        saveDialog.style.borderRadius = '10px';
        saveDialog.style.color = 'white';
        saveDialog.style.zIndex = '2000';
        saveDialog.style.minWidth = '300px';

        const title = document.createElement('div');
        title.textContent = 'Save Game';
        title.style.fontSize = '20px';
        title.style.marginBottom = '15px';
        title.style.textAlign = 'center';
        saveDialog.appendChild(title);

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Enter save name...';
        input.style.width = '100%';
        input.style.padding = '8px';
        input.style.marginBottom = '15px';
        input.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        input.style.border = '1px solid rgba(255, 255, 255, 0.3)';
        input.style.borderRadius = '5px';
        input.style.color = 'white';
        saveDialog.appendChild(input);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';

        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save';
        saveButton.style.flex = '1';
        saveButton.style.padding = '8px';
        saveButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        saveButton.style.border = 'none';
        saveButton.style.borderRadius = '5px';
        saveButton.style.color = 'white';
        saveButton.style.cursor = 'pointer';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.flex = '1';
        cancelButton.style.padding = '8px';
        cancelButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        cancelButton.style.border = 'none';
        cancelButton.style.borderRadius = '5px';
        cancelButton.style.color = 'white';
        cancelButton.style.cursor = 'pointer';

        buttonContainer.appendChild(saveButton);
        buttonContainer.appendChild(cancelButton);
        saveDialog.appendChild(buttonContainer);

        // Handle save action
        saveButton.addEventListener('click', () => {
            const saveName = input.value.trim();
            if (saveName) {
                const gameState = {
                    inventory: this.inventory,
                    plants: Array.from(this.plants.entries()),
                    tilledSoil: Array.from(this.tilledSoil.keys()),
                    timestamp: new Date().toLocaleString()
                };
                
                this.savedGames[saveName] = gameState;
                localStorage.setItem('gardenGameSaves', JSON.stringify(this.savedGames));
                document.body.removeChild(saveDialog);
            }
        });

        cancelButton.addEventListener('click', () => {
            document.body.removeChild(saveDialog);
        });

        document.body.appendChild(saveDialog);
    }

    loadGame() {
        // Create load game dialog
        const loadDialog = document.createElement('div');
        loadDialog.style.position = 'fixed';
        loadDialog.style.top = '50%';
        loadDialog.style.left = '50%';
        loadDialog.style.transform = 'translate(-50%, -50%)';
        loadDialog.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
        loadDialog.style.padding = '20px';
        loadDialog.style.borderRadius = '10px';
        loadDialog.style.color = 'white';
        loadDialog.style.zIndex = '2000';
        loadDialog.style.minWidth = '300px';
        loadDialog.style.maxHeight = '80vh';
        loadDialog.style.overflowY = 'auto';

        const title = document.createElement('div');
        title.textContent = 'Load Game';
        title.style.fontSize = '20px';
        title.style.marginBottom = '15px';
        title.style.textAlign = 'center';
        loadDialog.appendChild(title);

        const savesList = document.createElement('div');
        savesList.style.marginBottom = '15px';

        // Add saved games to the list
        Object.entries(this.savedGames).forEach(([saveName, saveData]) => {
            const saveItem = document.createElement('div');
            saveItem.style.padding = '10px';
            saveItem.style.marginBottom = '5px';
            saveItem.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            saveItem.style.borderRadius = '5px';
            saveItem.style.cursor = 'pointer';

            const saveTitleDiv = document.createElement('div');
            saveTitleDiv.textContent = saveName;
            saveTitleDiv.style.marginBottom = '5px';

            const saveTimeDiv = document.createElement('div');
            saveTimeDiv.textContent = saveData.timestamp;
            saveTimeDiv.style.fontSize = '12px';
            saveTimeDiv.style.opacity = '0.7';

            saveItem.appendChild(saveTitleDiv);
            saveItem.appendChild(saveTimeDiv);

            saveItem.addEventListener('mouseenter', () => {
                saveItem.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            });

            saveItem.addEventListener('mouseleave', () => {
                saveItem.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            });

            saveItem.addEventListener('click', () => {
                this.loadSaveGame(saveData);
                document.body.removeChild(loadDialog);
                this.closeMailboxMenu();
            });

            savesList.appendChild(saveItem);
        });

        loadDialog.appendChild(savesList);

        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.style.width = '100%';
        closeButton.style.padding = '8px';
        closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        closeButton.style.border = 'none';
        closeButton.style.borderRadius = '5px';
        closeButton.style.color = 'white';
        closeButton.style.cursor = 'pointer';

        closeButton.addEventListener('click', () => {
            document.body.removeChild(loadDialog);
        });

        loadDialog.appendChild(closeButton);
        document.body.appendChild(loadDialog);
    }

    loadSaveGame(saveData) {
        // Clear existing game state
        this.plants.forEach(plant => this.scene.remove(plant.mesh));
        this.tilledSoil.forEach(soil => this.scene.remove(soil));
        this.plants.clear();
        this.tilledSoil.clear();

        // Restore inventory
        this.inventory = saveData.inventory;
        this.updateInventoryDisplay();

        // Restore plants
        saveData.plants.forEach(([key, plantData]) => {
            const [x, z] = key.split(',').map(Number);
            const position = { x, z };
            this.tillSoil(key, position);
            
            // Recreate the plant
            const plantGeometry = new THREE.ConeGeometry(0.1, 0.2, 8);
            const plantMaterial = new THREE.MeshStandardMaterial({
                color: 0x90EE90
            });
            const plant = new THREE.Mesh(plantGeometry, plantMaterial);
            plant.position.set(x, 0.1, z);
            this.scene.add(plant);

            this.plants.set(key, {
                mesh: plant,
                type: plantData.type,
                growth: plantData.growth,
                waterCount: plantData.waterCount,
                isHarvestable: plantData.isHarvestable
            });

            // If the plant was grown, update its appearance
            if (plantData.waterCount > 0) {
                this.growPlant(key, this.plants.get(key));
            }
        });

        // Restore tilled soil
        saveData.tilledSoil.forEach(key => {
            const [x, z] = key.split(',').map(Number);
            if (!this.tilledSoil.has(key)) {
                this.tillSoil(key, { x, z });
            }
        });
    }

    openMessages() {
        console.log('Messages functionality to be implemented');
    }

    openSettings() {
        console.log('Settings functionality to be implemented');
    }
}

// Start the game
new GardenGame(); 