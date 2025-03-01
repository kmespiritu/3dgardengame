# 3D Garden Game

A 3D gardening game built with Three.js where players can create and maintain their virtual garden.

## Setup

1. Make sure you have Python installed (for running a local server)
2. Clone this repository
3. Navigate to the project directory

## Running the Game

You can run the game using Python's built-in HTTP server:

```bash
# If you're using Python 3.x
python -m http.server 8000

# If you're using Python 2.x
python -m SimpleHTTPServer 8000
```

Then open your browser and navigate to:
```
http://localhost:8000
```

## Controls

- Left click and drag to rotate the camera
- Right click and drag to pan
- Scroll wheel to zoom in/out

## Development

The project structure is organized as follows:

```
├── index.html          # Main HTML file
├── js/                 # JavaScript files
│   └── main.js         # Main game logic
└── README.md          # This file
```

## Technologies Used

- Three.js - 3D graphics library
- JavaScript (ES6+)
- HTML5 