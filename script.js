let puzzle
let mapping = {}
let history = []
let puzzleHistory = []
let hintsUsed = 0
let startTime = Date.now()
let solution = {}

const WORD_BANK = [
    "SEND", "MORE", "MONEY",
    "BASE", "BALL", "GAMES",
    "THIS", "THAT", "TEST",
    "CODE", "JAVA", "NODE"
]

function extractLetters(words, result) {
    return [...new Set((words.join("") + result).split(""))]
}

function generatePuzzle() {

    let attempts = 0

    while (true) {

        attempts++

        let w1 = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)]
        let w2 = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)]
        let result = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)]

        let letters = extractLetters([w1, w2], result)

        if (letters.length > 10) continue

        puzzle = {
            text: w1 + " + " + w2 + " = " + result,
            words: [w1, w2],
            result: result,
            letters: letters
        }

        solution = {}

        solvePuzzle()

        if (Object.keys(solution).length > 0) {

            puzzleHistory.push(puzzle)

            init()

            return

        }

        if (attempts > 50) {

            showMessage("Generating solvable puzzle...", "yellow")

        }

    }

}

function previousPuzzle() {

    if (puzzleHistory.length < 2) return

    puzzle = puzzleHistory[puzzleHistory.length - 2]

    solvePuzzle()

    init()

}

function loadCustomPuzzle() {

    let text = document.getElementById("customPuzzle").value

    if (!text.includes("=")) return

    let parts = text.split("=")
    let words = parts[0].split("+")
    let result = parts[1]

    puzzle = {
        text: text,
        words: words,
        result: result,
        letters: extractLetters(words, result)
    }

    solution = {}
    solvePuzzle()

    puzzleHistory.push(puzzle)

    init()

}

function init() {

    mapping = {}
    history = []
    hintsUsed = 0
    startTime = Date.now()

    document.getElementById("puzzleText").innerText = puzzle.text
    document.getElementById("hints").innerText = 0

    let area = document.getElementById("inputs")
    area.innerHTML = ""

    puzzle.letters.forEach(letter => {

        let input = document.createElement("input")
        input.max = 9

        input.onchange = () => handleMove(letter, input.value)

        area.appendChild(document.createTextNode(letter + ": "))
        area.appendChild(input)

    })

}

function isValid(map) {

    let used = Object.values(map)

    if (new Set(used).size !== used.length)
        return false

    let firstLetters = [puzzle.words[0][0], puzzle.words[1][0], puzzle.result[0]]

    for (let l of firstLetters)
        if (map[l] === 0) return false

    return true

}

function wordNumber(word, map) {
    return Number(word.split("").map(l => map[l]).join(""))
}

function checkEquation(map) {

    if (Object.keys(map).length !== puzzle.letters.length)
        return true

    let a = wordNumber(puzzle.words[0], map)
    let b = wordNumber(puzzle.words[1], map)
    let c = wordNumber(puzzle.result, map)

    return a + b === c

}

function backtracking(index, map, letters, used) {

    if (index === letters.length)
        return checkEquation(map)

    let letter = letters[index]

    if (map[letter] != undefined)
        return backtracking(index + 1, map, letters, used)

    for (let d = 0; d <= 9; d++) {

        if (used.has(d)) continue

        map[letter] = d

        if (!isValid(map)) {
            delete map[letter]
            continue
        }

        used.add(d)

        if (backtracking(index + 1, map, letters, used))
            return true

        used.delete(d)
        delete map[letter]
    }

    return false

}

function solvePuzzle() {

    backtrackingSolve(0, {}, {}, new Set())

}

function backtrackingSolve(index, map, temp, used) {

    if (index === puzzle.letters.length) {

        if (checkEquation(map)) {
            solution = { ...map }
            return true
        }

        return false

    }

    let letter = puzzle.letters[index]

    for (let d = 0; d <= 9; d++) {

        if (used.has(d)) continue

        map[letter] = d

        if (!isValid(map)) {
            delete map[letter]
            continue
        }

        used.add(d)

        if (backtrackingSolve(index + 1, map, temp, used)) return true

        used.delete(d)
        delete map[letter]

    }

    return false

}

function checkMove(letter, digit) {

    digit = parseInt(digit)

    let temp = { ...mapping }
    temp[letter] = digit

    if (Object.values(mapping).includes(digit) && mapping[letter] !== digit)
        return ["red", "Digit already used"]

    let possible = backtracking(0, { ...temp }, puzzle.letters, new Set(Object.values(temp)))

    if (!possible)
        return ["red", "No solution possible"]

    if (solution[letter] === digit)
        return ["green", "Correct move"]

    return ["yellow", "Still possible"]

}

function handleMove(letter, digit) {

    if (!digit) return

    history.push({ ...mapping })

    let result = checkMove(letter, digit)

    showMessage(result[1], result[0])

    if (result[0] === "red") {
        new Audio("https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg").play()
        return
    }

    mapping[letter] = parseInt(digit)

    if (result[0] === "green") {
        new Audio("https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg").play()
    }

    if (checkEquation(mapping) && Object.keys(mapping).length === puzzle.letters.length) {

        showMessage("Puzzle solved!", "green")

    }

}

function giveHint() {

    let remaining = puzzle.letters.filter(l => !mapping[l])

    if (!remaining.length) return

    let letter = remaining[0]

    mapping[letter] = solution[letter]

    hintsUsed++

    document.getElementById("hints").innerText = hintsUsed

    showMessage("Hint: " + letter + " = " + solution[letter], "green")

}

function undoMove() {

    if (history.length === 0) return

    mapping = history.pop()

    showMessage("Move undone", "yellow")

}

function showMessage(text, color) {

    let msg = document.getElementById("message")
    msg.innerText = text
    msg.className = color

}

function timer() {

    let t = Math.floor((Date.now() - startTime) / 1000)

    document.getElementById("timer").innerText = t

}

function newPuzzle() {

    generatePuzzle()

}

setInterval(timer, 1000)

newPuzzle()
function autoSolve() {

    if (!solution || Object.keys(solution).length === 0) {
        showMessage("No solution exists or puzzle unsolved", "red")
        return
    }

    let letters = puzzle.letters
    let index = 0

    function stepSolve() {

        if (index >= letters.length) {
            showMessage("AI solved the puzzle!", "green")
            return
        }

        let letter = letters[index]

        mapping[letter] = solution[letter]

        showMessage("AI assigns " + letter + " = " + solution[letter], "yellow")

        index++

        setTimeout(stepSolve, 700)

    }

    stepSolve()

}
