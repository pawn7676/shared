/*  board.js - draws a chessboard.
 *
 *  A shared file: ONE copy, used by every project. It
 *  lives in its own folder, "shared", next to the
 *  projects' folders:
 *
 *    (the folder that holds them all)
 *      shared/board.js ... this file, the only copy
 *      (one folder per project)
 *
 *  Each page loads it with
 *    <script src="../shared/board.js"></script>
 *  ("..", up one folder, out of the project's own). So
 *  wherever the projects are run or put online, "shared"
 *  has to sit next to them, and be reachable from them.
 *  A change here reaches every project at once: after
 *  changing it, try each project.
 *
 *  Copyright (C) 2026 pawn7676. Free software under the
 *  GNU General Public License, version 3 or later: see
 *  LICENSE, in this folder. Its colors and the place of
 *  its letters and numbers follow Lichess's board.
 *
 *  WHAT IT DRAWS, onto a <canvas> the page gives it:
 *    - the squares, with the last move's two squares
 *      tinted, a tapped piece's square highlighted, and a
 *      red glow under a king in check
 *    - the letters a-h and numbers 1-8 along two edges,
 *      under the pieces, as on Lichess - and, if asked, the
 *      material count in a corner
 *    - the pieces, from pieces.js (also in "shared")
 *  and it keeps the drawing sharp, however big the board is
 *  on screen and however far it's zoomed into ([#2]).
 *  Nothing else: no tapping, no dragging, no sliding
 *  pieces. A project adds those itself, and can draw its
 *  own extras over the board after each paint ([#7]).
 *
 *  ITS LOOK is in board.css, next to it in "shared": every
 *  color, and the font of the letters and numbers. That
 *  font, Noto Sans, is loaded by theme.css, the house
 *  style, also there. This file holds only sizes. A page
 *  loads all four before its own scripts:
 *    <link rel="stylesheet" href="../shared/theme.css">
 *    <link rel="stylesheet" href="../shared/board.css">
 *    <script src="../shared/pieces.js"></script>
 *    <script src="../shared/board.js"></script>
 *
 *  TALKING TO A PROJECT - one global, BOARD ([#9]). A
 *  project starts it once, BOARD.init(canvas, options), and
 *  calls BOARD.render() whenever what's on the board
 *  changes. On every paint the board asks the project what
 *  to show - options.describe(), which returns:
 *    pos ............ the position: a rules.js Position, or
 *                     anything with the same "board" (left
 *                     out: an empty board)
 *    lastMove ....... the last move's two squares, [from,
 *                     to], tinted (left out: no tint)
 *    selected ....... a tapped piece's square, highlighted
 *    check .......... the square of a king in check, which
 *                     glows red
 *    tints .......... other square tints, each drawn over
 *                     its square: [{ sq, color }], color a
 *                     ready "#rrggbbaa"
 *    hidden(sq) ..... true for a square whose piece is left
 *                     out of this paint (one sliding, say)
 *    showLastMove,
 *    showCheck ...... false turns that one off (on if left
 *                     out)
 *    showMaterial ... true turns the material count on (off
 *                     if left out)
 *  A square is rules.js's own number for it (rank * 16 +
 *  file - a1 is 0, h8 is 119), and -1 is none. Which way up
 *  the board is, is set with BOARD.setOrientation.
 *  The rest of options:
 *    report(text) ... where a problem goes - a missing file
 *                     or color - so each project shows it
 *                     its own way
 *    afterDraw(ctx) . called at the end of every paint, to
 *                     draw over the board, in the board's
 *                     own units ([#1])
 *    onResolution() . called when the canvas gets a new
 *                     number of pixels ([#2])
 *
 *  SECTIONS
 *    [#1] SQUARES & UNITS ...... the board's own units;
 *                                which way up; squares
 *    [#2] SHARPNESS ............ the canvas's pixels
 *    [#3] COLORS & FONTS ....... read from board.css
 *    [#4] PIECES ............... pieces.js -> pictures
 *    [#5] CHECK GLOW
 *    [#6] LETTERS, NUMBERS & MATERIAL
 *    [#7] PAINTING ............. render
 *    [#8] STARTING UP .......... init
 *    [#9] BOARD ................ the one way in
 */

var BOARD = (function () {
"use strict";

/*==================================================================
 * [#1] SQUARES & UNITS - the board is drawn in its own units:
 * CELL to a square, SIZE across the whole board, whatever size it
 * is on screen. Every size and position in this file is in these
 * units (most of them as a fraction of CELL); [#2] turns them into
 * real pixels. A project drawing over the board (afterDraw) uses
 * the same units: BOARD.CELL and BOARD.SIZE.
 * On screen the squares are counted 0-63 from the top-left, row by
 * row ("grid" numbers); gridOf and squareAt turn a square into its
 * grid number and back, for whichever way up the board is.
 *==================================================================*/
var CELL = 144, SIZE = CELL * 8;
var FILES = "abcdefgh";

var canvas = null, ctx = null;
var options = {};

// Which color is at the bottom: "w" or "b".
var orientation = "w";
function flipped() { return orientation === "b"; }

// A square (rules.js's number) -> its grid number on screen.
function gridOf(sq) {
  var r = 7 - (sq >> 4), f = sq & 15;
  if (flipped()) { r = 7 - r; f = 7 - f; }
  return r * 8 + f;
}

// A grid number on screen -> its square.
function squareAt(i) {
  var r = Math.floor(i / 8), f = i % 8;
  if (flipped()) { r = 7 - r; f = 7 - f; }
  return (7 - r) * 16 + f;
}

// The board's own area on screen, as { left, top, width, height }
// in CSS pixels - the canvas's box less any border or padding a
// project's stylesheet gives it - or null if it isn't laid out yet.
function boardRect() {
  if (!canvas) return null;
  var r = canvas.getBoundingClientRect();
  var cs = getComputedStyle(canvas);
  function px(v) { return parseFloat(v) || 0; }
  var left = px(cs.borderLeftWidth) + px(cs.paddingLeft);
  var top = px(cs.borderTopWidth) + px(cs.paddingTop);
  var width = r.width - left - px(cs.borderRightWidth) - px(cs.paddingRight);
  var height = r.height - top - px(cs.borderBottomWidth) - px(cs.paddingBottom);
  if (!(width > 0) || !(height > 0)) return null;
  return { left: r.left + left, top: r.top + top, width: width, height: height };
}

// The square under a point on screen (a tap's clientX and
// clientY), or -1 if it's off the board. Measured against the
// board's size on screen, not the canvas's pixels.
function squareFromPoint(x, y) {
  var rect = boardRect();
  if (!rect) return -1;
  var f = Math.floor((x - rect.left) * 8 / rect.width);
  var r = Math.floor((y - rect.top) * 8 / rect.height);
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return squareAt(r * 8 + f);
}

// 0 for a light square, 1 for a dark one, by grid number.
function sqClass(i) {
  var r = Math.floor(i / 8), f = i % 8;
  return (r + f) % 2 === 0 ? 0 : 1;
}

/*==================================================================
 * [#2] SHARPNESS - a <canvas> is a picture with a set number of
 * pixels. When the browser has to stretch it to fill its box on
 * screen, everything on it goes soft - the pieces, the letters and
 * numbers, anything drawn over them. So the canvas always has
 * exactly as many pixels as the screen shows it with: its size on
 * screen, times the screen's pixels per CSS pixel (2 on an iPad),
 * times the pinch-zoom (1 when not zoomed in). (Its size on screen
 * is the board's own, without any border round it - boardRect,
 * [#1].)
 * Everything is still drawn in the board's own units ([#1]), scaled
 * up to the real size (scale), so the drawing code never needs to
 * know the real size. The pieces are pictures too, so they're drawn
 * again from their SVG at exactly one square's real size ([#4]) -
 * each one then lands on the board pixel for pixel.
 * The size is worked out again (syncResolution) whenever the
 * board's size on screen changes - resized, the iPad turned round,
 * a pinch-zoom - once it has stayed put for RESOLUTION_WAIT_MS, not
 * on every step of a drag or a pinch. Until then the board just
 * stretches, a little soft, for a moment. It watches for those
 * changes itself ([#8]); a project that resizes the board can also
 * say so at once (BOARD.resized).
 * A board whose size on screen is a whole number of pixels per
 * square has no soft seams between the squares - it's up to the
 * project's layout to size it that way, if it can.
 *==================================================================*/
// The most pixels across the canvas, however far it's zoomed into:
// past this a very zoomed-in board goes a little soft again. Each
// canvas takes 4 bytes a pixel of memory, and iPadOS closes a page
// that uses too much - keep it at 3200 or less, and a multiple of
// 8.
var BOARD_MAX_PX = 3200;
// How long (ms) the board's size on screen has to stay put before
// it's drawn again at the new size.
var RESOLUTION_WAIT_MS = 150;

// Canvas pixels per board unit.
function scale() { return canvas ? canvas.width / SIZE : 1; }

// One square's width in canvas pixels - always a whole number.
function cellPx() { return canvas ? canvas.width / 8 : CELL; }

// Screen pixels per CSS pixel, times the pinch-zoom.
function screenPixelRatio() {
  var zoom = (window.visualViewport && window.visualViewport.scale) || 1;
  return (window.devicePixelRatio || 1) * zoom;
}

// The canvas size (pixels across) that matches the board on screen
// right now - a multiple of 8, at most BOARD_MAX_PX - or 0 if the
// board isn't laid out yet.
function wantedPx() {
  var rect = boardRect();
  if (!rect) return 0;
  var px = Math.round(rect.width * screenPixelRatio() / 8) * 8;
  return Math.max(8, Math.min(BOARD_MAX_PX, px));
}

// Gives the canvas the size the board has on screen, draws the
// pieces again at that size and repaints - if it isn't that size
// already. True if it changed.
function syncResolution() {
  clearTimeout(resolutionTimer);
  if (!canvas) return false;
  var px = wantedPx();
  if (!px || px === canvas.width) return false;
  // (a new size clears the canvas - repainted below)
  canvas.width = px;
  canvas.height = px;
  if (options.onResolution) options.onResolution();
  bakePieces(); // (each piece is repainted as it arrives)
  render();
  return true;
}

// syncResolution, once the size has stayed put for
// RESOLUTION_WAIT_MS.
var resolutionTimer = null;
function scheduleResolution() {
  clearTimeout(resolutionTimer);
  resolutionTimer = setTimeout(syncResolution, RESOLUTION_WAIT_MS);
}

/*==================================================================
 * [#3] COLORS & FONTS - the board is a <canvas>, which CSS can't
 * style from the outside, so every color and font it uses is a
 * setting in board.css, and this file asks for each one by its
 * name there, right where it's used - cssColor("--board-light"),
 * or canvasFont() with the names of a weight and a family. To
 * change a color or the font, change board.css, not this file.
 * Each value is read the first time it's asked for, and remembered
 * after that - the CSS doesn't change while the page is open, and
 * the board is drawn many times a second.
 * Colors come back as plain "#rrggbb" whatever way they're written
 * in CSS, which is what hexA needs. A missing or mistyped color is
 * reported (options.report) the first time it's drawn, and drawn
 * in the page's --error color instead (black if the page has none),
 * so the mistake shows on the board. A missing font setting is
 * reported the same way, and the browser's own sans-serif font is
 * used. (With board.css missing altogether, that's said once, at
 * start-up ([#8]), not once for every color.)
 * cssVar, cssColor, hexA and canvasFont are BOARD's too ([#9]), so
 * a project's own drawing can read its colors the same way.
 *==================================================================*/
function report(text) {
  if (options.report) options.report(text);
  else { try { console.warn(text); } catch (e) { /* no console */ } }
}

// True once start-up has found board.css missing ([#8]).
var cssMissing = false;

// A CSS setting on :root as text, or fallback if it isn't set.
function cssVar(name, fallback) {
  var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Any CSS color -> plain "#rrggbb", or null if it isn't a valid
// color (empty, or a typo).
var colorProbe = null;
function toHex(raw) {
  if (!raw) return null;
  if (!colorProbe) colorProbe = document.createElement("canvas").getContext("2d");
  // A canvas reports back any color it's given in one form. An
  // invalid one is ignored, so setting two different starting
  // colors first and comparing tells a valid color from a typo.
  colorProbe.fillStyle = "#000000"; colorProbe.fillStyle = raw;
  var a = colorProbe.fillStyle;
  colorProbe.fillStyle = "#ffffff"; colorProbe.fillStyle = raw;
  if (a !== colorProbe.fillStyle) return null;
  if (a.charAt(0) === "#") return a;
  // "rgba(r, g, b, a)" - the value had transparency; keep r/g/b
  // only.
  var n = a.match(/[\d.]+/g);
  return "#" + n.slice(0, 3).map(function (x) {
    var h = Number(x).toString(16);
    return h.length < 2 ? "0" + h : h;
  }).join("");
}

// A color by its CSS name, as "#rrggbb" - or the page's --error
// color, with a warning, if it's missing or mistyped. Remembered
// after the first time.
var colorCache = {};
function cssColor(name) {
  if (name in colorCache) return colorCache[name];
  var raw = cssVar(name, "");
  var hex = toHex(raw);
  if (!hex) {
    if (!cssMissing) {
      report("CSS color " + name + (raw ? ' is not a valid color ("' + raw + '")' : " is missing") +
        " - drawing it in the --error color");
    }
    hex = toHex(cssVar("--error", "")) || "#000000";
  }
  colorCache[name] = hex;
  return hex;
}

// A color with see-through-ness added: "#rrggbb" and 0-1 ->
// "#rrggbbaa", the form canvas and CSS both take. So a color stays
// one setting in the CSS, whatever see-through-ness it's drawn
// with.
function hexA(hex, alpha) {
  var a = Math.max(0, Math.min(1, alpha));
  var byte = Math.round(a * 255);
  return hex + (byte < 16 ? "0" : "") + byte.toString(16).toLowerCase();
}

// One part of a font (family or weight) by its CSS name, or the
// fallback (with a warning) if it's missing. Remembered after the
// first time.
var fontCache = {};
function cssFontPart(name, fallback) {
  if (name in fontCache) return fontCache[name];
  var v = cssVar(name, "");
  if (!v) {
    if (!cssMissing) report("CSS font setting " + name + " is missing - using " + fallback);
    v = fallback;
  }
  fontCache[name] = v;
  return v;
}

// A canvas font from the CSS names of a weight and a family, e.g.
// canvasFont("--board-coord-font-weight", 30,
// "--board-coord-font-family") -> '600 30px "Noto Sans", ...'.
function canvasFont(weightName, px, familyName) {
  return cssFontPart(weightName, "normal") + " " + px + "px " + cssFontPart(familyName, "sans-serif");
}

/*==================================================================
 * [#4] PIECES - the twelve pictures in pieces.js (PIECE_SVG), each
 * drawn onto a small canvas of its own at one square's real size
 * on screen (cellPx, [#2]) - and again whenever that changes. A
 * paint then only copies them (drawImage), and each piece lands on
 * the board pixel for pixel.
 * A piece is always drawn into one square in the board's units, so
 * a piece from an earlier size still fits its square while the new
 * ones are on their way. BOARD.pieceArt hands a project the same
 * pictures, for pieces it draws itself (a piece being dragged or
 * sliding, say).
 *==================================================================*/
// A FEN letter's piece -> its name in pieces.js.
var PIECE_NAME = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
function pieceName(letter) {
  var type = PIECE_NAME[letter.toLowerCase()];
  if (!type) return null;
  return (letter === letter.toUpperCase() ? "white-" : "black-") + type;
}

var art = {};             // piece name -> its canvas
var repaintTimer = null;
// Which baking is the latest: a piece from an earlier one (an
// older size) that arrives late is thrown away.
var bakeGen = 0;

function bakePieces() {
  if (typeof PIECE_SVG === "undefined") {
    report("pieces.js is missing - no piece pictures (keep it in the \"shared\" folder, " +
      "next to this page's folder)");
    return;
  }
  var gen = ++bakeGen;
  var size = cellPx();
  "KQRBNPkqrbnp".split("").forEach(function (letter) {
    var name = pieceName(letter), svgArt = PIECE_SVG[name];
    if (!svgArt) { report("pieces.js has no picture named " + name); return; }
    // xmlns is a label, not a download - an <svg> drawn on its own
    // like this one won't show without it.
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" ' +
      'viewBox="' + PIECE_VIEWBOX + '" width="' + size + '" height="' +
      size + '">' + svgArt + "</svg>";
    var img = new Image();
    img.onerror = function () {
      if (gen === bakeGen) report("Piece picture failed to load: " + name);
    };
    img.onload = function () {
      if (gen !== bakeGen) return; // (an older size)
      var cv = document.createElement("canvas");
      cv.width = size; cv.height = size;
      cv.getContext("2d").drawImage(img, 0, 0, size, size);
      art[name] = cv;
      // one repaint once they've all come in, not twelve
      clearTimeout(repaintTimer);
      repaintTimer = setTimeout(render, 0);
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

// A piece's picture by its FEN letter ("K", "p"...), or null until
// it has loaded.
function pieceArt(letter) {
  var name = letter && pieceName(letter);
  return (name && art[name]) || null;
}

/*==================================================================
 * [#5] CHECK GLOW - the red glow on the square of a king in check:
 * a round gradient from the square's center. Its four colors are
 * --check-halo-* in board.css.
 *==================================================================*/
var CHECK_HALO = {
  // How far the gradient reaches, as a fraction of one square.
  // Half a square's diagonal is ~0.707, so 0.708 just reaches the
  // corners and the glow fills the whole square.
  radius: 0.708,
  // Points along that reach (0 = center, 1 = the very end):
  //   midStop - where --check-halo-core has blended into -mid
  //   fadeStop - where it has faded out to fully see-through
  midStop: 0.25,
  fadeStop: 0.89
};

// Paints the glow over the square whose top-left corner is (x, y).
function drawCheckHalo(x, y) {
  var cx = x + CELL / 2, cy = y + CELL / 2;
  var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, CELL * CHECK_HALO.radius);
  halo.addColorStop(0, cssColor("--check-halo-core"));
  halo.addColorStop(CHECK_HALO.midStop, cssColor("--check-halo-mid"));
  halo.addColorStop(CHECK_HALO.fadeStop, hexA(cssColor("--check-halo-fade-start"), 0));
  halo.addColorStop(1, hexA(cssColor("--check-halo-fade-end"), 0));
  ctx.fillStyle = halo;
  ctx.fillRect(x, y, CELL, CELL);
}

/*==================================================================
 * [#6] LETTERS, NUMBERS & MATERIAL - the a-h / 1-8 labels along the
 * board's bottom and right edges, and the material-difference
 * number in a corner square. Both are plain text in the same small
 * font (--board-coord-font-family and --board-coord-font-weight in
 * board.css), each in a color that shows up against its square:
 * --board-coord-on-light on a light square, --board-coord-on-dark
 * on a dark one (coordColor). They're drawn on the squares, under
 * the pieces, as Lichess does - a piece standing on one covers it.
 *==================================================================*/
// Sizes and gaps, as fractions of one square. The gaps are
// measured to the letters and numbers themselves - not to the space
// the font leaves around them - so they stay as set here in any
// font (fillCoordText, below).
var COORDS = {
  fontSize: 0.21,
  // Gap from a square's left edge: the file letters (a-h) and the
  // material count.
  padX: 0.0625,
  // Gap from the board's right edge: the rank numbers (1-8). The
  // numbers line up on their right, so a narrow "1" sits as far
  // right as an "8".
  padRight: 0.06,
  // Gap from a square's top edge: the rank numbers and the
  // material count.
  padTop: 0.09,
  // Gap from the board's bottom edge up to the letters' baseline -
  // the bottom of every letter but the "g", which hangs below it.
  padBottom: 0.065
};

// The label color for the square with grid number i.
function coordColor(i) {
  return sqClass(i) === 0 ? cssColor("--board-coord-on-light") : cssColor("--board-coord-on-dark");
}

// The label font, set on the canvas.
function setCoordFont() {
  ctx.font = canvasFont("--board-coord-font-weight", Math.round(CELL * COORDS.fontSize),
    "--board-coord-font-family");
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

// Draws `text` with its baseline at y and the glyph itself starting
// at x - or, with alignRight, ending at x - leaving out the bit of
// space a font puts either side of a character.
function fillCoordText(text, x, y, alignRight) {
  var m = ctx.measureText(text);
  ctx.fillText(text, alignRight ? x - m.actualBoundingBoxRight : x + m.actualBoundingBoxLeft, y);
}

// How far the tops of the numbers sit above their baseline, in the
// label font (setCoordFont first) - so a number can be placed by
// its top.
function digitAscent() {
  return ctx.measureText("12345678").actualBoundingBoxAscent;
}

// Files along the bottom row, ranks down the right-hand column -
// reversed when the board is flipped.
function drawCoordinates() {
  var flip = flipped();
  setCoordFont();
  var letterY = SIZE - CELL * COORDS.padBottom;
  var numberX = SIZE - CELL * COORDS.padRight;
  var numberY = CELL * COORDS.padTop + digitAscent();
  for (var f = 0; f < 8; f++) {
    ctx.fillStyle = coordColor(56 + f);
    fillCoordText(FILES[flip ? 7 - f : f], f * CELL + CELL * COORDS.padX, letterY);
  }
  for (var r = 0; r < 8; r++) {
    ctx.fillStyle = coordColor(r * 8 + 7);
    fillCoordText(String(flip ? r + 1 : 8 - r), numberX, r * CELL + numberY, true);
  }
}

// The material count - a plain number (no +/- sign, so it can't
// crowd into a corner piece's outline), in the upper-left corner of
// the LEADING side's own home-rank square on the left edge: White's
// number in a1's place, Black's in a8's - always that side's own
// back-rank corner, wherever it is on screen. The same corner gaps
// (COORDS.padX / padTop) as the labels, and under the pieces like
// them. Nothing when material is equal.
function drawMaterialCount(board) {
  var diff = materialDiff(board);
  if (diff === 0) return;
  setCoordFont();
  // White's home rank is at screen row 0 when flipped, row 7
  // otherwise; Black's is whichever row White's isn't.
  var row = ((diff > 0) === flipped()) ? 0 : 7;
  ctx.fillStyle = coordColor(row * 8);
  fillCoordText(String(Math.abs(diff)), CELL * COORDS.padX,
    row * CELL + CELL * COORDS.padTop + digitAscent());
}

// The material difference on the board right now, in the usual
// point values (kings left out), White's minus Black's. Counted
// afresh from the position each time, so it's right through
// promotions and take-backs alike, as on Lichess.
var PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function materialDiff(board) {
  var diff = 0;
  for (var i = 0; i < 128; i++) {
    if (i & 0x88) continue; // (the off-board half of the 0x88 array)
    var c = board[i];
    if (!c) continue;
    var val = PIECE_VALUE[c.toLowerCase()] || 0;
    diff += (c === c.toUpperCase()) ? val : -val;
  }
  return diff;
}

/*==================================================================
 * [#7] PAINTING - render() paints the whole board, from what the
 * project says to show (options.describe - see TALKING TO A
 * PROJECT at the top), in this order:
 *   1. each square: its color - plain, the last move's tint, or a
 *      tapped piece's highlight, which wins - then any other tint
 *      the project gives it, then the check glow
 *   2. the letters and numbers, and the material count
 *   3. the pieces (but on squares the project hides)
 *   4. whatever the project draws itself (options.afterDraw)
 *==================================================================*/
function render() {
  if (!ctx) return;
  var v = (options.describe && options.describe()) || {};
  var board = v.pos ? v.pos.board : null;
  // In board units ([#1]), scaled to the canvas's real pixels
  // ([#2]). Set on every paint: a new canvas size resets it.
  var s = scale();
  ctx.setTransform(s, 0, 0, s, 0, 0);

  var tint = v.lastMove && v.showLastMove !== false
    ? [gridOf(v.lastMove[0]), gridOf(v.lastMove[1])] : null;
  var chosen = v.selected >= 0 ? gridOf(v.selected) : -1;
  var checked = v.check >= 0 && v.showCheck !== false ? gridOf(v.check) : -1;
  var tints = v.tints || [];
  for (var i = 0; i < 64; i++) {
    var x = (i % 8) * CELL, y = Math.floor(i / 8) * CELL;
    var moved = tint && tint.indexOf(i) >= 0;
    ctx.fillStyle = sqClass(i) === 0
      ? (i === chosen ? cssColor("--board-light-selected") : moved ? cssColor("--board-light-last-move") : cssColor("--board-light"))
      : (i === chosen ? cssColor("--board-dark-selected") : moved ? cssColor("--board-dark-last-move") : cssColor("--board-dark"));
    ctx.fillRect(x, y, CELL, CELL);
    for (var t = 0; t < tints.length; t++) {
      if (gridOf(tints[t].sq) !== i) continue;
      ctx.fillStyle = tints[t].color;
      ctx.fillRect(x, y, CELL, CELL);
    }
    if (i === checked) drawCheckHalo(x, y);
  }

  drawCoordinates();
  if (board && v.showMaterial) drawMaterialCount(board);

  if (board) {
    for (var j = 0; j < 64; j++) {
      var sq = squareAt(j);
      var p = board[sq];
      if (!p || (v.hidden && v.hidden(sq))) continue;
      var pic = pieceArt(p);
      if (pic) ctx.drawImage(pic, (j % 8) * CELL, Math.floor(j / 8) * CELL, CELL, CELL);
    }
  }

  if (options.afterDraw) options.afterDraw(ctx);
}

/*==================================================================
 * [#8] STARTING UP - init, once: the canvas and options, a check
 * that board.css is there, the canvas sized for the screen and the
 * pieces drawn, the first paint, and the watch on the board's size
 * on screen ([#2]).
 * The letters and numbers are canvas text, which - unlike text on
 * the page - doesn't wait for a font to load before it's drawn: it
 * just uses another font, and never draws itself again once the
 * real one arrives. So the label font is asked for here, and the
 * board painted again once it's in.
 *==================================================================*/
function init(cv, opts) {
  canvas = cv;
  ctx = cv.getContext("2d");
  options = opts || {};
  if (!cssVar("--board-light", "")) {
    cssMissing = true;
    report("board.css is missing - the board has no colors (keep it in the \"shared\" folder, " +
      "next to this page's folder)");
  }
  // (a canvas already the right size isn't changed, so its pieces
  // are drawn here)
  if (!syncResolution()) bakePieces();
  render();
  if (window.ResizeObserver) new ResizeObserver(scheduleResolution).observe(canvas);
  window.addEventListener("resize", scheduleResolution);
  // (a pinch-zoom changes this one only)
  if (window.visualViewport) window.visualViewport.addEventListener("resize", scheduleResolution);
  if (document.fonts && document.fonts.load) {
    try {
      document.fonts.load(canvasFont("--board-coord-font-weight", 16, "--board-coord-font-family"))
        .then(function () { render(); }, function () { /* keeps the fallback font */ });
    } catch (err) { /* a bad font setting: the fallback font */ }
  }
}

/*==================================================================
 * [#9] BOARD - the board's one way in. Everything else in this file
 * is its own business.
 *==================================================================*/
return {
  // Once: the canvas to draw on, and the options (TALKING TO A
  // PROJECT, at the top).
  init: init,
  // Paint the board again.
  render: render,
  // Which color is at the bottom: "w" or "b". Takes effect at the
  // next paint.
  setOrientation: function (color) { orientation = color === "b" ? "b" : "w"; },
  // True with Black at the bottom.
  flipped: flipped,
  // Squares and grid numbers ([#1]).
  gridOf: gridOf,
  squareAt: squareAt,
  squareFromPoint: squareFromPoint,
  // The canvas being drawn on.
  canvas: function () { return canvas; },
  // The board's own units ([#1]), and canvas pixels per unit
  // ([#2]).
  CELL: CELL,
  SIZE: SIZE,
  scale: scale,
  // The board's size on screen has just changed: it's drawn sharp
  // again once the size stays put ([#2]).
  resized: scheduleResolution,
  // A piece's picture by its FEN letter ([#4]).
  pieceArt: pieceArt,
  // Reading colors and fonts from the CSS ([#3]).
  cssVar: cssVar,
  cssColor: cssColor,
  hexA: hexA,
  canvasFont: canvasFont
};
})();
