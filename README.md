# CryptArithmetic · AI Puzzle Solver

A modern web-based cryptarithmetic puzzle game with a visual AI backtracking solver.

## Features

- **Play Mode**: Solve puzzles manually with instant feedback.
- **AI Learner Mode**: Watch a backtracking solver work in real-time.
- **Visual Solver**: See nodes, assignments, and backtracks visualized as a tree.
- **Custom Puzzles**: Create and solve your own equations.
- **Stats & Streaks**: Track your progress.
- **Responsive Design**: Clean, modern UI with dark mode.

## Tech Stack

- **Frontend**: HTML, CSS, vanilla JavaScript
- **Backend**: Python + Flask
- **AI**: Backtracking search algorithm

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/pavxxx/Cryptar.git
   cd cryptarithm-game
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the server:
   ```bash
   python app.py
   ```

4. Open the app in your browser:
   ```
   http://localhost:5000
   ```

## Usage

### Play Mode
- Click "New Puzzle" to get a random cryptarithmetic puzzle.
- Assign digits to letters by clicking the letter boxes.
- Use "Hint" to reveal one correct letter assignment.
- Click "Check" to validate your solution.
- Click "Custom" to enter your own puzzle.

### AI Learner Mode
- Select a puzzle from the dropdown.
- Click "Start Solver" to watch the backtracking algorithm in action.
- The visualization shows:
  - **Nodes**: Each node represents a state in the search tree.
  - **Assignments**: Which letter is assigned which digit.
  - **Backtracks**: When the solver abandons a path.
- Adjust "Speed" to control how fast the solver works.
- Click "Stop" to halt the solver.

## Project Structure

```
cryptarithm-game/
├── app.py              # Flask backend with solver and puzzle generator
├── requirements.txt    # Python dependencies
├── static/
│   ├── css/
│   │   └── style.css   # Styles for the game
│   └── js/
│       ├── main.js     # Game logic and UI
│       └── solver.js   # AI backtracking solver implementation
└── templates/
    └── index.html      # Main HTML template
```

## Development

### Adding New Puzzles

To add more puzzles, edit the `PRESET_PUZZLES` list in `app.py`:

```python
PRESET_PUZZLES = [
    {"name": "SEND + MORE = MONEY", "words": ["SEND", "MORE"], "result": "MONEY"},
    # Add your puzzles here
]
```

### Custom Puzzles

Custom puzzles must follow these rules:
- Two words + one result word (e.g., `A + B = C`)
- All words in uppercase
- Each letter represents a unique digit (0–9)
- Leading letters cannot be 0

