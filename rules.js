/*  rules.js - the rules of chess.
 *
 *  A shared file: ONE copy, used by every project. It
 *  lives in its own folder, "shared", next to the
 *  projects' folders:
 *
 *    (the folder that holds them all)
 *      shared/rules.js ... this file, the only copy
 *      (one folder per project)
 *
 *  Each page loads it with
 *    <script src="../shared/rules.js"></script>
 *  (".." = up one folder, out of the project's own). So
 *  wherever the projects are run or put online, "shared"
 *  has to sit next to them, and be reachable from them.
 *  A change here reaches every project at once: after
 *  changing it, try each project. A project may not use
 *  every part of it - some parts are there for the
 *  projects that do.
 *
 *  Copyright (C) 2026 pawn7676. Free software under the
 *  GNU General Public License, version 3 or later: see
 *  LICENSE, in this folder.
 *  Its rules follow python-chess (Niklas Fiekas and
 *  contributors, GPL-3.0-or-later), so it gives the same
 *  answers: the same draw by insufficient material, and
 *  moves and positions written the same way. Its moves
 *  have the same fields and flag letters as chess.js's
 *  (Jeff Hlywa, BSD-2-Clause). No code from either is
 *  included.
 *
 *  What it knows: which moves are legal and what they are
 *  called (SAN, with disambiguation and + or #), castling,
 *  en passant and promotion; how the game ends at a
 *  position (gameEnd: mate, stalemate, or a draw by
 *  insufficient material, by the same rule as
 *  python-chess); and positions as FENs, both ways: read
 *  (new Position(fen)) and written (toFen). Nothing else:
 *  it doesn't evaluate, score, search or suggest moves.
 *
 *  Checked against the standard perft counts, which count
 *  every possible line of play to a given depth: start
 *  position depth 4 = 197281, "Kiwipete" depth 3 = 97862,
 *  position 3 depth 4 = 43238, position 4 depth 3 = 9467.
 *  Worth re-checking after any change here.
 *
 *  The board is 0x88: 128 slots, rank * 16 + file, so a
 *  square is off the board exactly when (sq & 0x88) != 0.
 *  Pieces are FEN letters, upper case for white.
 *
 *  Load it as a plain <script>, before any script that
 *  uses it. It makes one global, RULES = { Position,
 *  sqName, nameSq, START }. RULES.Position(fen?) has: load,
 *  toFen, clone, kingSq, attacked, inCheck, pseudoMoves,
 *  apply, legalMoves, uciOf, sanOf, findUci, applyUci,
 *  gameEnd, and turn/board.
 */

"use strict";

function makeRules() {
  "use strict";

  var FILES = "abcdefgh";
  var KNIGHT = [33, 31, 18, 14, -33, -31, -18, -14];
  var BISHOP = [17, 15, -17, -15];
  var ROOK = [16, 1, -16, -1];
  var ROYAL = [17, 16, 15, 1, -17, -16, -15, -1];
  var BISHOPQ = ["b", "q"], ROOKQ = ["r", "q"];

  // Does a slider of one of `types` see `sq` along a clear
  // line in one of `dirs`?
  function raySees(b, sq, by, dirs, types) {
    for (var m = 0; m < dirs.length; m++) {
      var d = dirs[m], i = sq + d;
      while ((i & 0x88) === 0) {
        var p = b[i];
        if (p) {
          if (colorOf(p) === by && types.indexOf(typeOf(p)) >= 0) return true;
          break;
        }
        i += d;
      }
    }
    return false;
  }

  function sqName(i) { return FILES[i & 15] + ((i >> 4) + 1); }
  function nameSq(s) { return (s.charCodeAt(1) - 49) * 16 + (s.charCodeAt(0) - 97); }
  function isWhite(p) { return p && p === p.toUpperCase(); }
  function colorOf(p) { return isWhite(p) ? "w" : "b"; }
  function typeOf(p) { return p ? p.toLowerCase() : null; }
  function onBoard(i) { return (i & 0x88) === 0; }

  var START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  function Position(fen) {
    this.board = new Array(128).fill(null);
    this.turn = "w";
    this.castle = { K: false, Q: false, k: false, q: false };
    this.ep = -1;
    this.half = 0;
    this.full = 1;
    this.load(fen || START);
  }

  Position.prototype.load = function (fen) {
    var parts = fen.trim().split(/\s+/);
    this.board = new Array(128).fill(null);
    var rows = parts[0].split("/");
    for (var r = 0; r < 8; r++) {
      var i = (7 - r) * 16, row = rows[r];
      for (var k = 0; k < row.length; k++) {
        var c = row[k];
        if (/[1-8]/.test(c)) i += parseInt(c, 10);
        else { this.board[i] = c; i++; }
      }
    }
    this.turn = parts[1] === "b" ? "b" : "w";
    var cs = parts[2] || "-";
    this.castle = {
      K: cs.indexOf("K") >= 0, Q: cs.indexOf("Q") >= 0,
      k: cs.indexOf("k") >= 0, q: cs.indexOf("q") >= 0
    };
    this.ep = (parts[3] && parts[3] !== "-") ? nameSq(parts[3]) : -1;
    this.half = parseInt(parts[4] || "0", 10);
    this.full = parseInt(parts[5] || "1", 10);
  };

  // ---- The position as a FEN ----
  // (Not every project using this file calls toFen; see
  // the top.)
  // The one place a position is written out as text - the
  // opposite of load(). All six fields: pieces, side to
  // move, castling, en passant, half-move clock, move
  // number. A caller that only cares about the position
  // itself can keep the first four fields and drop the two
  // counters.
  // Two fields are written the way python-chess (and
  // Lichess) write them, so the same position is always
  // written the same way:
  //   - castling only while that king and rook are still
  //     at home, so a FEN with stale rights can't confuse
  //     anything
  //   - the en passant square only when an en passant
  //     capture can really be played - otherwise 1.e4 c5
  //     2.Nf3 and 1.Nf3 c5 2.e4 would be two different
  //     positions
  Position.prototype.toFen = function () {
    var b = this.board, rows = [];
    for (var r = 7; r >= 0; r--) {
      var row = "", empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = b[r * 16 + f];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += p;
      }
      if (empty) row += empty;
      rows.push(row);
    }
    var c = "";
    if (this.castle.K && b[4] === "K" && b[7] === "R") c += "K";
    if (this.castle.Q && b[4] === "K" && b[0] === "R") c += "Q";
    if (this.castle.k && b[116] === "k" && b[119] === "r") c += "k";
    if (this.castle.q && b[116] === "k" && b[112] === "r") c += "q";
    var ep = "-";
    if (this.ep >= 0 && this.legalMoves().some(function (m) { return m.flags.indexOf("e") >= 0; })) {
      ep = sqName(this.ep);
    }
    return rows.join("/") + " " + this.turn + " " + (c || "-") + " " + ep + " " + this.half + " " + this.full;
  };

  // Called once per candidate move, so it skips the
  // constructor (which would parse a FEN) and copies fields.
  Position.prototype.clone = function () {
    var p = Object.create(Position.prototype);
    p.board = this.board.slice();
    p.turn = this.turn;
    p.castle = { K: this.castle.K, Q: this.castle.Q, k: this.castle.k, q: this.castle.q };
    p.ep = this.ep; p.half = this.half; p.full = this.full;
    return p;
  };

  Position.prototype.kingSq = function (color) {
    var want = color === "w" ? "K" : "k";
    for (var i = 0; i < 128; i++) {
      if (!onBoard(i)) { i += 7; continue; }
      if (this.board[i] === want) return i;
    }
    return -1;
  };

  // Is square `sq` attacked by side `by`?
  Position.prototype.attacked = function (sq, by) {
    var b = this.board, i, j, p;

    // pawns
    var pd = by === "w" ? [-17, -15] : [17, 15];
    for (j = 0; j < 2; j++) {
      i = sq + pd[j];
      if (onBoard(i)) { p = b[i]; if (p && typeOf(p) === "p" && colorOf(p) === by) return true; }
    }

    // knights
    for (j = 0; j < 8; j++) {
      i = sq + KNIGHT[j];
      if (onBoard(i)) { p = b[i]; if (p && typeOf(p) === "n" && colorOf(p) === by) return true; }
    }

    // king
    for (j = 0; j < 8; j++) {
      i = sq + ROYAL[j];
      if (onBoard(i)) { p = b[i]; if (p && typeOf(p) === "k" && colorOf(p) === by) return true; }
    }

    // bishops, rooks, queens
    if (raySees(b, sq, by, BISHOP, BISHOPQ)) return true;
    if (raySees(b, sq, by, ROOK, ROOKQ)) return true;
    return false;
  };

  Position.prototype.inCheck = function (color) {
    var c = color || this.turn;
    var k = this.kingSq(c);
    if (k < 0) return false;
    return this.attacked(k, c === "w" ? "b" : "w");
  };

  // Moves that follow the pieces' movement rules, before
  // checking whether they leave the king in check. Each is
  // {from, to, piece, color, captured, promotion, flags};
  // flags: c capture, e en passant, b pawn double step,
  // p promotion, k/q castling. (The same fields and flag
  // letters as chess.js uses: see the top.)
  Position.prototype.pseudoMoves = function () {
    var out = [], b = this.board, us = this.turn, them = us === "w" ? "b" : "w";

    function add(from, to, extra) {
      var m = {
        from: from, to: to,
        piece: typeOf(b[from]), color: us,
        captured: b[to] ? typeOf(b[to]) : null,
        promotion: null, flags: ""
      };
      if (extra) for (var k in extra) m[k] = extra[k];
      if (m.captured) m.flags += "c";
      out.push(m);
    }

    for (var from = 0; from < 128; from++) {
      if (!onBoard(from)) { from += 7; continue; }
      var pc = b[from];
      if (!pc || colorOf(pc) !== us) continue;
      var t = typeOf(pc), to, d, j;

      if (t === "p") {
        var fwd = us === "w" ? 16 : -16;
        var startRank = us === "w" ? 1 : 6;
        var lastRank = us === "w" ? 7 : 0;
        to = from + fwd;
        if (onBoard(to) && !b[to]) {
          if ((to >> 4) === lastRank) {
            ["q", "r", "b", "n"].forEach(function (pr) {
              add(from, to, { promotion: pr, flags: "p" });
            });
          } else {
            add(from, to, {});
            var dbl = from + 2 * fwd;
            if ((from >> 4) === startRank && !b[dbl]) add(from, dbl, { flags: "b" });
          }
        }
        var caps = us === "w" ? [17, 15] : [-17, -15];
        for (j = 0; j < 2; j++) {
          to = from + caps[j];
          if (!onBoard(to)) continue;
          if (b[to] && colorOf(b[to]) === them) {
            if ((to >> 4) === lastRank) {
              ["q", "r", "b", "n"].forEach(function (pr) {
                add(from, to, { promotion: pr, flags: "p" });
              });
            } else add(from, to, {});
          } else if (to === this.ep) {
            out.push({
              from: from, to: to, piece: "p", color: us,
              captured: "p", promotion: null, flags: "ce"
            });
          }
        }
        continue;
      }

      if (t === "n" || t === "k") {
        var offs = t === "n" ? KNIGHT : ROYAL;
        for (j = 0; j < 8; j++) {
          to = from + offs[j];
          if (!onBoard(to)) continue;
          if (b[to] && colorOf(b[to]) === us) continue;
          add(from, to, {});
        }
        continue;
      }

      var dirs = t === "b" ? BISHOP : t === "r" ? ROOK : ROYAL;
      for (j = 0; j < dirs.length; j++) {
        d = dirs[j]; to = from + d;
        while (onBoard(to)) {
          if (!b[to]) { add(from, to, {}); }
          else {
            if (colorOf(b[to]) === them) add(from, to, {});
            break;
          }
          to += d;
        }
      }
    }

    // castling: rights, empty squares between, and no check
    // on the king's start, path or landing square
    var kSq = us === "w" ? nameSq("e1") : nameSq("e8");
    var kRight = us === "w" ? this.castle.K : this.castle.k;
    var qRight = us === "w" ? this.castle.Q : this.castle.q;
    var king = b[kSq];
    if (king && typeOf(king) === "k" && colorOf(king) === us && !this.inCheck(us)) {
      if (kRight && !b[kSq + 1] && !b[kSq + 2] &&
          !this.attacked(kSq + 1, them) && !this.attacked(kSq + 2, them)) {
        out.push({ from: kSq, to: kSq + 2, piece: "k", color: us,
                   captured: null, promotion: null, flags: "k" });
      }
      if (qRight && !b[kSq - 1] && !b[kSq - 2] && !b[kSq - 3] &&
          !this.attacked(kSq - 1, them) && !this.attacked(kSq - 2, them)) {
        out.push({ from: kSq, to: kSq - 2, piece: "k", color: us,
                   captured: null, promotion: null, flags: "q" });
      }
    }
    return out;
  };

  // Plays a move on this position (changes it in place).
  // The move must come from pseudoMoves for the side to move.
  Position.prototype.apply = function (m) {
    var b = this.board, us = this.turn;
    b[m.to] = m.promotion ? (us === "w" ? m.promotion.toUpperCase() : m.promotion)
                          : b[m.from];
    b[m.from] = null;

    if (m.flags.indexOf("e") >= 0) {
      b[m.to + (us === "w" ? -16 : 16)] = null;
    }
    if (m.flags.indexOf("k") >= 0) {
      b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null;
    }
    if (m.flags.indexOf("q") >= 0) {
      b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null;
    }

    // castling rights lost by a king move, or by anything
    // leaving or landing on a rook's corner
    if (m.piece === "k") {
      if (us === "w") { this.castle.K = this.castle.Q = false; }
      else { this.castle.k = this.castle.q = false; }
    }
    var h1 = nameSq("h1"), a1 = nameSq("a1"), h8 = nameSq("h8"), a8 = nameSq("a8");
    if (m.from === h1 || m.to === h1) this.castle.K = false;
    if (m.from === a1 || m.to === a1) this.castle.Q = false;
    if (m.from === h8 || m.to === h8) this.castle.k = false;
    if (m.from === a8 || m.to === a8) this.castle.q = false;

    this.ep = (m.flags.indexOf("b") >= 0)
      ? m.from + (us === "w" ? 16 : -16) : -1;

    this.half = (m.piece === "p" || m.captured) ? 0 : this.half + 1;
    if (us === "b") this.full++;
    this.turn = us === "w" ? "b" : "w";
  };

  Position.prototype.legalMoves = function () {
    var self = this, out = [];
    this.pseudoMoves().forEach(function (m) {
      var p = self.clone();
      p.apply(m);
      if (!p.inCheck(m.color)) out.push(m);
    });
    return out;
  };

  Position.prototype.uciOf = function (m) {
    return sqName(m.from) + sqName(m.to) + (m.promotion || "");
  };

  // Standard algebraic notation, with disambiguation and a
  // + or # suffix. Pass the legal-move list if you have it.
  Position.prototype.sanOf = function (m, legalList) {
    var legal = legalList || this.legalMoves();
    var san;
    if (m.flags.indexOf("k") >= 0) san = "O-O";
    else if (m.flags.indexOf("q") >= 0) san = "O-O-O";
    else {
      var s = "";
      if (m.piece !== "p") {
        s += m.piece.toUpperCase();
        var same = legal.filter(function (o) {
          return o.piece === m.piece && o.to === m.to && o.from !== m.from;
        });
        if (same.length) {
          var sameFile = same.some(function (o) { return (o.from & 15) === (m.from & 15); });
          var sameRank = same.some(function (o) { return (o.from >> 4) === (m.from >> 4); });
          if (!sameFile) s += FILES[m.from & 15];
          else if (!sameRank) s += String((m.from >> 4) + 1);
          else s += sqName(m.from);
        }
      } else if (m.captured) {
        s += FILES[m.from & 15];
      }
      if (m.captured) s += "x";
      s += sqName(m.to);
      if (m.promotion) s += "=" + m.promotion.toUpperCase();
      san = s;
    }
    var after = this.clone();
    after.apply(m);
    if (after.inCheck(after.turn)) {
      san += after.legalMoves().length ? "+" : "#";
    }
    return san;
  };

  // The legal move with this UCI, or null.
  Position.prototype.findUci = function (uci, legalList) {
    var moves = legalList || this.legalMoves();
    for (var i = 0; i < moves.length; i++) {
      if (this.uciOf(moves[i]) === uci) return moves[i];
    }

    // castling written as king-takes-rook (e1h1), which
    // some sources use instead of e1g1
    for (i = 0; i < moves.length; i++) {
      var m = moves[i];
      if (m.piece === "k" && m.flags.indexOf("k") >= 0 &&
          uci === sqName(m.from) + sqName(m.to + 1)) return m;
      if (m.piece === "k" && m.flags.indexOf("q") >= 0 &&
          uci === sqName(m.from) + sqName(m.to - 2)) return m;
    }
    return null;
  };

  // Plays a UCI move if legal: {move, san}, or null.
  Position.prototype.applyUci = function (uci) {
    var moves = this.legalMoves();
    var m = this.findUci(uci, moves);
    if (!m) return null;
    var san = this.sanOf(m, moves);
    this.apply(m);
    return { move: m, san: san };
  };

  // ---- How the game ends at this position ----
  // (Not every project using this file calls gameEnd; see
  // the top.)
  // "mate", "stalemate", "draw" or null (play goes on).
  // "draw" here is insufficient material only: neither side
  // can ever mate, whatever is played. Repetition and the
  // 50-move rule depend on the moves before, which a
  // position doesn't hold, so they're left out.
  // It's the same material rule python-chess uses, so this
  // file agrees with anything worked out with python-chess:
  // a draw for K v K, K+N v K, and bishops that are all on
  // squares of one color - but NOT for K+N+N v K or bishops
  // on opposite colors, where mate is possible (see
  // cannotMate, below).
  Position.prototype.gameEnd = function () {
    if (!this.legalMoves().length) return this.inCheck(this.turn) ? "mate" : "stalemate";
    if (cannotMate(this.board, "w") && cannotMate(this.board, "b")) return "draw";
    return null;
  };

  // True if `color` could never give mate, however the game
  // went on - even with the other side playing along. Only
  // three cases:
  //   - a bare king
  //   - a king and ONE knight, when the other side has
  //     nothing but its king and queens: any other piece of
  //     theirs could block their own king in for a knight
  //     mate
  //   - a king and bishops, when every bishop on the board
  //     stands on squares of one shade, and there's no pawn
  //     or knight on the board - one of those could block a
  //     king in too
  // A pawn, rook or queen can always mate in the end.
  function cannotMate(b, color) {
    var mine = [], theirs = [];  // each side's pieces but the king
    var shades = {};             // the square shades bishops stand on
    for (var sq = 0; sq < 128; sq++) {
      if (!onBoard(sq)) { sq += 7; continue; }
      var t = typeOf(b[sq]);
      if (!t || t === "k") continue;
      (colorOf(b[sq]) === color ? mine : theirs).push(t);
      if (t === "b") shades[((sq >> 4) + (sq & 15)) % 2] = true;
    }
    function only(list, types) {
      return list.every(function (x) { return types.indexOf(x) >= 0; });
    }
    if (!mine.length) return true;
    if (!only(mine, ["n", "b"])) return false;
    if (mine.indexOf("n") >= 0) return mine.length === 1 && only(theirs, ["q"]);
    return Object.keys(shades).length === 1 && only(theirs, ["b", "r", "q"]);
  }

  return { Position: Position, sqName: sqName, nameSq: nameSq, START: START };
}

var RULES = makeRules();
