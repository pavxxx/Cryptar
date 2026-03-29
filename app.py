from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
import random
import time

app = Flask(__name__)
CORS(app)

PRESET_PUZZLES = [
    {"name": "SEND + MORE = MONEY", "words": ["SEND", "MORE"], "result": "MONEY"},
    {"name": "BASE + BALL = GAMES", "words": ["BASE", "BALL"], "result": "GAMES"},
    {"name": "TWO + TWO = FOUR",    "words": ["TWO",  "TWO"],  "result": "FOUR"},
    {"name": "ODD + ODD = EVEN",    "words": ["ODD",  "ODD"],  "result": "EVEN"},
    {"name": "EAT + THAT = APPLE",  "words": ["EAT",  "THAT"], "result": "APPLE"},
    {"name": "COCA + COLA = OASIS", "words": ["COCA", "COLA"], "result": "OASIS"},
]

# ── Simpler 4-letter puzzles for AI learner (fewer steps ≈ 50–200) ────────
SIMPLE_PUZZLES = [
    {"name": "HAND + HAND = CAKE",  "words": ["HAND", "HAND"],  "result": "CAKE",  "difficulty": "easy"},
    {"name": "HAND + DEAL = FEED",  "words": ["HAND", "DEAL"],  "result": "FEED",  "difficulty": "easy"},
    {"name": "NODE + NODE = LONE",  "words": ["NODE", "NODE"],  "result": "LONE",  "difficulty": "easy"},
    {"name": "TOLD + TOLD = LONE",  "words": ["TOLD", "TOLD"],  "result": "LONE",  "difficulty": "easy"},
    {"name": "FAKE + FAKE = DAME",  "words": ["FAKE", "FAKE"],  "result": "DAME",  "difficulty": "easy"},
    {"name": "DAME + DAME = TOLD",  "words": ["DAME", "DAME"],  "result": "TOLD",  "difficulty": "medium"},
    {"name": "LONE + NODE = BALL",  "words": ["LONE", "NODE"],  "result": "BALL",  "difficulty": "medium"},
    {"name": "HAND + DAME = MASH",  "words": ["HAND", "DAME"],  "result": "MASH",  "difficulty": "medium"},
]

WORD_BANK = [
    "SEND","MORE","MONEY","BASE","BALL","GAMES","CODE","JAVA",
    "NODE","MATH","PLUS","GOOD","WORK","DONE","BEST","DEAL",
    "DARK","STAR","MOON","FIRE","WIND","LAKE","ROCK","GOLD",
]

# ── helpers ──────────────────────────────────────────────────────────────────

def unique_letters(words, result):
    seen, out = set(), []
    for c in "".join(words) + result:
        if c not in seen:
            seen.add(c); out.append(c)
    return out

def unique_letters_rtl(words, result):
    seen, out = set(), []
    max_len = max([len(w) for w in words] + [len(result)])
    for i in range(1, max_len + 1):
        for w in words + [result]:
            if i <= len(w):
                c = w[-i]
                if c not in seen:
                    seen.add(c)
                    out.append(c)
    return out

def can_be_valid(words, result, m):
    max_len = max([len(w) for w in words] + [len(result)])
    carry = 0
    for i in range(1, max_len + 1):
        col_chars = [w[-i] for w in words if i <= len(w)]
        res_char = result[-i] if i <= len(result) else None
        
        if any(c not in m for c in col_chars): return True
        if res_char and res_char not in m: return True
        
        col_sum = carry + sum(m[c] for c in col_chars)
        
        if res_char:
            if (col_sum % 10) != m[res_char]: return False
            carry = col_sum // 10
        else:
            if col_sum != 0: return False
            carry = col_sum // 10
    return carry == 0

def first_letters(words, result):
    return {w[0] for w in words} | {result[0]}

def word_value(word, m):
    return int("".join(str(m[c]) for c in word))

def check_eq(words, result, m):
    if len(m) < len(unique_letters(words, result)):
        return False
    return sum(word_value(w, m) for w in words) == word_value(result, m)

# ── solver (no trace) ─────────────────────────────────────────────────────────

def solve_only(words, result):
    letters = unique_letters_rtl(words, result)
    if len(letters) > 10:
        return None
    fl = first_letters(words, result)
    sol = [None]

    def bt(idx, m, used):
        if sol[0]: return True
        if idx == len(letters):
            if check_eq(words, result, m):
                sol[0] = dict(m); return True
            return False
        letter = letters[idx]
        for d in range(10):
            if d in used or (d == 0 and letter in fl): continue
            m[letter] = d; used.add(d)
            if can_be_valid(words, result, m):
                if bt(idx + 1, m, used): return True
            del m[letter]; used.discard(d)
        return False

    bt(0, {}, set())
    return sol[0]

# ── brute-force solver (no pruning, for comparison) ───────────────────────────

def solve_brute(words, result, max_steps=50000):
    letters = unique_letters_rtl(words, result)
    if len(letters) > 10:
        return None, 0
    fl = first_letters(words, result)
    sol = [None]; ctr = [0]

    def bt(idx, m, used):
        if sol[0] or ctr[0] >= max_steps: return bool(sol[0])
        ctr[0] += 1
        if idx == len(letters):
            if check_eq(words, result, m):
                sol[0] = dict(m); return True
            return False
        letter = letters[idx]
        for d in range(10):
            if ctr[0] >= max_steps: return False
            if d in used or (d == 0 and letter in fl): continue
            m[letter] = d; used.add(d)
            # NO pruning — just recurse
            if bt(idx + 1, m, used): return True
            del m[letter]; used.discard(d)
        return False

    bt(0, {}, set())
    return sol[0], ctr[0]

# ── solver with full trace ────────────────────────────────────────────────────

def solve_traced(words, result, max_steps=2000):
    letters = unique_letters_rtl(words, result)
    if len(letters) > 10:
        return None, []
    fl = first_letters(words, result)
    sol = [None]; steps = []; ctr = [0]

    def nid():
        ctr[0] += 1; return str(ctr[0])

    def bt(idx, m, used, parent_id, depth):
        if sol[0] or len(steps) >= max_steps: return bool(sol[0])
        if idx == len(letters):
            if check_eq(words, result, m):
                sol[0] = dict(m)
                steps.append({"node_id": nid(), "parent_id": parent_id,
                               "type": "success", "letter": None, "digit": None,
                               "mapping": dict(m), "depth": depth,
                               "message": "✓ Solution found!"})
                return True
            return False
        letter = letters[idx] #systematic search agent
        for d in range(10):
            if len(steps) >= max_steps: return False
            if d in used or (d == 0 and letter in fl): continue
            m[letter] = d; used.add(d)
            node = nid()
            pruned = not can_be_valid(words, result, m)
            step_type = "assign"
            msg = f"Trying {letter} = {d}"
            concept = "constraint_assignment"
            if pruned:
                step_type = "pruned"
                msg = f"✂ Pruned — {letter}={d} violates column constraint"
                concept = "pruning"
            steps.append({"node_id": node, "parent_id": parent_id,
                          "type": step_type, "letter": letter, "digit": d,
                          "mapping": dict(m), "depth": depth,
                          "message": msg, "concept": concept})
            if not pruned:
                if bt(idx + 1, m, used, node, depth + 1): return True
            if len(steps) < max_steps:
                steps.append({"node_id": nid(), "parent_id": node,
                              "type": "backtrack", "letter": letter, "digit": d,
                              "mapping": dict(m), "depth": depth + 1,
                              "message": f"✗ Backtrack — {letter}={d} leads nowhere",
                              "concept": "backtracking"})
            del m[letter]; used.discard(d)
        return False

    root = nid()
    steps.append({"node_id": root, "parent_id": None, "type": "start",
                  "letter": None, "digit": None, "mapping": {}, "depth": 0,
                  "message": "Starting backtracking search…",
                  "concept": "csp_start"})
    bt(0, {}, set(), root, 1)
    return sol[0], steps

# ── puzzle generator ──────────────────────────────────────────────────────────

def gen_puzzle(difficulty=None):
    if difficulty == 'easy':
        min_l, max_l = 3, 5
    elif difficulty == 'medium':
        min_l, max_l = 5, 7
    elif difficulty == 'hard':
        min_l, max_l = 7, 10
    else:
        min_l, max_l = 5, 9

    for _ in range(300):
        w1 = random.choice(WORD_BANK)
        w2 = random.choice(WORD_BANK)
        res = random.choice(WORD_BANK)
        if w1 == w2 == res: continue
        letters = unique_letters([w1, w2], res)
        if not (min_l <= len(letters) <= max_l): continue
        sol = solve_only([w1, w2], res)
        if sol:
            return {"words": [w1, w2], "result": res,
                    "letters": letters, "text": f"{w1} + {w2} = {res}",
                    "name": f"{w1} + {w2} = {res}", "solution": sol,
                    "difficulty": difficulty or "medium"}
    return None

# ── routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/puzzle")
def api_puzzle():
    difficulty = request.args.get("difficulty")
    p = gen_puzzle(difficulty)
    if not p: return jsonify({"error": "Could not generate"}), 500
    return jsonify({k: v for k, v in p.items() if k != "solution"})

@app.route("/api/solve", methods=["POST"])
def api_solve():
    d = request.json
    words  = [w.strip().upper() for w in d.get("words", [])]
    result = d.get("result", "").strip().upper()
    max_s = d.get("max_steps", 2000)
    sol, steps = solve_traced(words, result, max_steps=max_s)
    return jsonify({"solution": sol, "steps": steps,
                    "total_steps": len(steps), "truncated": len(steps) >= max_s})

@app.route("/api/compare", methods=["POST"])
def api_compare():
    """Compare backtracking (with pruning) vs brute-force."""
    d = request.json
    words  = [w.strip().upper() for w in d.get("words", [])]
    result = d.get("result", "").strip().upper()

    # Backtracking with pruning & timing
    t0 = time.perf_counter()
    sol_bt, steps_bt = solve_traced(words, result, max_steps=15000)
    t_bt = time.perf_counter() - t0

    # Brute force & timing
    t0 = time.perf_counter()
    sol_bf, count_bf = solve_brute(words, result, max_steps=50000)
    t_bf = time.perf_counter() - t0

    return jsonify({
        "backtracking": {
            "solution": sol_bt,
            "steps": len(steps_bt),
            "time_ms": round(t_bt * 1000, 2),
        },
        "brute_force": {
            "solution": sol_bf,
            "steps": count_bf,
            "time_ms": round(t_bf * 1000, 2),
        },
        "letters": unique_letters(words, result),
    })

@app.route("/api/validate", methods=["POST"])
def api_validate():
    d = request.json
    mapping  = {k: int(v) for k, v in d.get("mapping", {}).items()}
    solution = {k: int(v) for k, v in d.get("solution", {}).items()}
    letter = d.get("letter", "")
    digit  = int(d.get("digit", -1))
    for k, v in mapping.items():
        if k != letter and v == digit:
            return jsonify({"status": "error",
                            "message": f"⚠ Digit {digit} already used for {k}"})
    if solution and letter in solution:
        if solution[letter] == digit:
            return jsonify({"status": "correct",
                            "message": f"✓ {letter} = {digit} is correct!"})
        return jsonify({"status": "wrong",
                        "message": f"✗ {letter} = {digit} is incorrect"})
    return jsonify({"status": "possible",
                    "message": f"Possible — checking {letter} = {digit}…"})

@app.route("/api/hint", methods=["POST"])
def api_hint():
    d = request.json
    sol     = {k: int(v) for k, v in d.get("solution", {}).items()}
    mapping = {k: int(v) for k, v in (d.get("mapping") or {}).items()}
    letters = d.get("letters", [])
    for letter in letters:
        if letter not in mapping:
            return jsonify({"letter": letter, "digit": sol[letter],
                            "message": f"💡 Hint: {letter} = {sol[letter]}"})
    return jsonify({"message": "All letters assigned!"})

@app.route("/api/presets")
def api_presets():
    out = []
    # Add simple puzzles first (marked easy)
    for p in SIMPLE_PUZZLES:
        letters = unique_letters(p["words"], p["result"])
        if len(letters) > 10: continue
        out.append({"name": p["name"], "words": p["words"],
                    "result": p["result"], "letters": letters,
                    "text": " + ".join(p["words"]) + " = " + p["result"],
                    "difficulty": p.get("difficulty", "easy")})
    # Then add standard puzzles
    for p in PRESET_PUZZLES:
        letters = unique_letters(p["words"], p["result"])
        if len(letters) > 10: continue
        out.append({"name": p["name"], "words": p["words"],
                    "result": p["result"], "letters": letters,
                    "text": " + ".join(p["words"]) + " = " + p["result"],
                    "difficulty": "hard"})
    return jsonify(out)

@app.route("/api/solution", methods=["POST"])
def api_solution():
    d = request.json
    words  = [w.strip().upper() for w in d.get("words", [])]
    result = d.get("result", "").strip().upper()
    return jsonify({"solution": solve_only(words, result)})

@app.route("/api/stats", methods=["POST"])
def api_stats():
    """Accept and echo back session stats for persistence."""
    d = request.json
    return jsonify(d)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
