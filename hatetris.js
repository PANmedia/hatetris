
// global well attributes
var wellBlockWidth = 10; // min=4
var wellBlockHeight = 20; // min=bar
var bar = 4;
var tableBodyId = 'hatetris-table-body';
var cellClass = 'hatetris-cell';
var activeCellClass = cellClass + ' hatetris-cell-active';
var placedCellClass = cellClass + ' hatetris-cell-placed';
var pieceClass = 'hatetris-piece';
var difficulty = 10;
var difficultySettings = {
    impossibru: 1,
    extreme: 1.4,
    hard: 1.9,
    medium: 2.9,
    easy: 4.9,
    childsPlay: 10
};

var fallSpeedLevels = [1000, 800, 600, 500, 400, 300, 200, 100];
var fallSpeedLevel = 0;
var fallSpeed = fallSpeedLevels[fallSpeedLevel];
var levelLines = 5;

var orientations;
var liveWell;
var livePiece;
var searchDepth; // min = 0, advisable max = 1
var replayOut;
var replayIn;
var replayTimeoutId;
var fallIntervalId;

var keyLeft = 37;
var keyUp = 38;
var keyRight = 39;
var keyDown = 40;

// basic game config
// note that these are cunningly placed with the least
// useful first
var pieces = {
    "S": [
        {"x": 1, "y": 2},
        {"x": 2, "y": 1},
        {"x": 2, "y": 2},
        {"x": 3, "y": 1}
    ],
    "Z": [
        {"x": 1, "y": 1},
        {"x": 2, "y": 1},
        {"x": 2, "y": 2},
        {"x": 3, "y": 2}
    ],
    "O": [
        {"x": 1, "y": 1},
        {"x": 1, "y": 2},
        {"x": 2, "y": 1},
        {"x": 2, "y": 2}
    ],
    "I": [
        {"x": 0, "y": 1},
        {"x": 1, "y": 1},
        {"x": 2, "y": 1},
        {"x": 3, "y": 1}
    ],
    "L": [
        {"x": 1, "y": 1},
        {"x": 1, "y": 2},
        {"x": 2, "y": 1},
        {"x": 3, "y": 1}
    ],
    "J": [
        {"x": 1, "y": 1},
        {"x": 1, "y": 2},
        {"x": 1, "y": 3},
        {"x": 2, "y": 1}
    ],
    "T": [
        {"x": 1, "y": 1},
        {"x": 2, "y": 1},
        {"x": 2, "y": 2},
        {"x": 3, "y": 1}
    ]
};
var transforms = {
    "L": 1,
    "R": 1,
    "D": 1,
    "U": 1
};

// lock a piece into the well
// create lines if necessary
// increment score if line(s) made
// this is the ONLY piece of code which modifies a well object!
function addPiece(thisWell, thisPiece) {

    var orientation = orientations[thisPiece.id][thisPiece.o];

    // this is the top left point in the bounding box of this orientation of this piece
    var xActual = thisPiece.x + orientation.xMin;
    var yActual = thisPiece.y + orientation.yMin;

    if (thisWell.blocks) {
        for (var row = 0; row < orientation.yDim; row++) {
            for (var col = 0; col < orientation.xDim; col++) {
                if (orientation.rows[row] & 1 << col) {
                    thisWell.blocks[thisPiece.y + orientation.yMin + row][thisPiece.x + orientation.xMin + col] = thisPiece.id;
                }
            }
        }
    }

    // update the "highestBlue" value to account for newly-placed piece
    thisWell.highestBlue = Math.min(thisWell.highestBlue, yActual);

    // row by row bitwise line alteration
    // because we do this from the top down, we can remove lines as we go
    for (var row = 0; row < orientation.yDim; row++) {
        // can't negative bit-shift, but alas X can be negative
        thisWell.content[yActual + row] |= (orientation.rows[row] << xActual);

        // check for a complete line now
        // NOTE: completed lines don't count if you've lost
        if (
                yActual >= bar
                && thisWell.content[yActual + row] == (1 << wellBlockWidth) - 1
                ) {
            // move all lines above this point down
            for (var k = yActual + row; k > 1; k--) {
                thisWell.content[k] = thisWell.content[k - 1];
            }

            if (thisWell.blocks) {
                thisWell.blocks.splice(yActual + row, 1);
                var blocks = [];
                for (var col = 0; col < wellBlockWidth; col++) {
                    blocks.push(cellClass);
                }
                thisWell.blocks.unshift(blocks);
            }

            // insert a new blank line at the top
            // though of course the top line will always be blank anyway
            thisWell.content[0] = 0;

            thisWell.score++;
            thisWell.highestBlue++;
            restartFalling(Math.floor(thisWell.score / levelLines));
        }
    }
}

// given a well and a piece, find the best possible location to put it
// return the best rating found
function bestWellRating(thisWell, pieceId, thisSearchDepth) {
    var thisPiece = {
        "id": pieceId,
        "x": 0,
        "y": 0,
        "o": 0
    };

    // iterate over all possible resulting positions and get
    // best rating
    var bestRating = null;

    // move the piece down to a lower position before we have to
    // start pathfinding for it
    // move through empty rows
    while (
            thisPiece.y + 4 < wellBlockHeight    // piece is above the bottom
            && thisWell.content[thisPiece.y + 4] == 0 // nothing immediately below it
            ) {
        thisPiece = tryTransform(thisWell, thisPiece, "D"); // down
    }

    // push first position
    var piecePositions = [];
    piecePositions.push(thisPiece);

    var ints = [];
    ints[hashCode(thisPiece.x, thisPiece.y, thisPiece.o)] = 1;

    // a simple for loop won't work here because
    // we are increasing the list as we go
    var i = 0;
    while (i < piecePositions.length) {
        thisPiece = piecePositions[i];

        // apply all possible transforms
        for (var j in transforms) {

            var newPiece = tryTransform(thisWell, thisPiece, j);

            // transformation failed?
            if (newPiece == null) {

                // piece locked? better add that to the list
                // do NOT check locations, they aren't significant here
                if (j == "D") {

                    // make newWell from thisWell
                    // no deep copying in javascript!!
                    var newWell = {
                        "content": [],
                        "score": thisWell.score,
                        "highestBlue": thisWell.highestBlue
                    };
                    for (var row2 = 0; row2 < wellBlockHeight; row2++) {
                        newWell.content.push(thisWell.content[row2]);
                    }

                    // alter the well
                    // this will update newWell, including certain well metadata
                    addPiece(newWell, thisPiece);

                    // here is the clever recursive search bit
                    // higher is better
                    var currentRating = newWell.highestBlue + (
                            thisSearchDepth == 0 ?
                            0
                            :
                            // deeper lines are worth less than immediate lines
                            // this is so the game will never give you a line if it can avoid it
                            // NOTE: make sure rating doesn't return a range of more than 100 values...
                            worstPieceRating(newWell, thisSearchDepth - 1) / 100
                            );

                    // store
                    if (bestRating == null || currentRating > bestRating) {
                        bestRating = currentRating;
                    }
                }
            }

            // transform succeeded?
            else {

                // new location? append to list
                // check locations, they are significant
                var newHashCode = hashCode(newPiece.x, newPiece.y, newPiece.o);

                if (ints[newHashCode] == undefined) {
                    piecePositions.push(newPiece);
                    ints[newHashCode] = 1;
                }
            }

        }
        i++;
    }

    return bestRating;
}

// initialise all variables for a new game or replay
// can take whatever time
function clearField() {

    // empty well
    // zero score
    // top blue = wellDepth = 20
    liveWell = {
        content: [],
        score: 0,
        highestBlue: wellBlockHeight,
        blocks: []
    };
    for (var row = 0; row < wellBlockHeight; row++) {
        liveWell.content.push(0);
        var blocks = [];
        for (var col = 0; col < wellBlockWidth; col++) {
            blocks.push(cellClass);
        }
        liveWell.blocks.push(blocks);
    }
    drawWell(liveWell);

    drawScore();

    // first piece
    livePiece = worstPiece(liveWell);
    if (Math.random() * difficulty > 1) {
        livePiece.id = pickRandomProperty(pieces);
    }
    drawPiece(livePiece);

    // new replay
    replayOut = [];
}

function pickRandomProperty(obj) {
    var result;
    var count = 0;
    for (var prop in obj) {
        if (Math.random() < 1/++count) {
           result = prop;
        }
    }
    return result;
}

// run once to setup
// create the well in HTML
// can take as long as needed
function createPlayingField() {

    // create playing field
    var tbody = document.getElementById(tableBodyId);
    for (var i = 0; i < wellBlockHeight; i++) {

        var tr = document.createElement("tr");
        tbody.appendChild(tr);

        for (var j = 0; j < wellBlockWidth; j++) {
            var td = document.createElement("td");
            td.className = cellClass;
            if (i == bar) {
                td.style.borderTop = "1px solid red";
            }
            tr.appendChild(td);
        }
    }

    // also, generate those first piece rotations
    orientations = {};
    for (var i in pieces) {
        var bits = pieces[i];

        // generate an initial set of 0s and nulls for each orientation
        orientations[i] = [];
        for (var o = 0; o < 4; o++) {
            var rows = [];
            for (var row = 0; row < 4; row++) {
                rows.push(0);
            }
            orientations[i].push(
                    {
                        "xMin": null, // minimum X coordinate of bits in this orientation (0, 1, 2 or 3)
                        "yMin": null, // minimum Y coordinate of bits in this orientation (0, 1, 2 or 3)
                        "xDim": null, // width
                        "yDim": null, // height
                        "rows": rows  // binary representation of the bits on each row
                    }
            );
        }

        for (var j in bits) {
            var bit = {"x": bits[j].x, "y": bits[j].y};
            for (var o = 0; o < 4; o++) {
                orientations[i][o].rows[bit.y] += 1 << bit.x;

                // update extents
                if (orientations[i][o].xMin == null || bit.x < orientations[i][o].xMin) {
                    orientations[i][o].xMin = bit.x;
                }

                if (orientations[i][o].yMin == null || bit.y < orientations[i][o].yMin) {
                    orientations[i][o].yMin = bit.y;
                }

                // starts as xMax but we recalculate later
                if (orientations[i][o].xDim == null || bit.x > orientations[i][o].xDim) {
                    orientations[i][o].xDim = bit.x;
                }

                // starts as yMax but we recalculate later
                if (orientations[i][o].yDim == null || bit.y > orientations[i][o].yDim) {
                    orientations[i][o].yDim = bit.y;
                }

                // rotate this bit around the middle of the 4x4 grid
                bit = {"x": 3 - bit.y, "y": bit.x};
            }
        }

        for (var o = 0; o < 4; o++) {
            // turn Maxes into Dims
            orientations[i][o].xDim = orientations[i][o].xDim - orientations[i][o].xMin + 1;
            orientations[i][o].yDim = orientations[i][o].yDim - orientations[i][o].yMin + 1;

            // reduce that list of rows to the minimum
            // truncate top rows
            while (orientations[i][o].rows[0] == 0) {
                orientations[i][o].rows.shift();
            }

            // truncate bottom rows
            while (orientations[i][o].rows[orientations[i][o].rows.length - 1] == 0) {
                orientations[i][o].rows.pop();
            }

            // shift left as many times as necessary
            for (row = 0; row < orientations[i][o].yDim; row++) {
                orientations[i][o].rows[row] >>= orientations[i][o].xMin;
            }
        }
    }
}

// draw this piece
// no real need for optimisation here
function drawPiece(thisPiece) {
    var orientation = orientations[thisPiece.id][thisPiece.o];
    for (var row = 0; row < orientation.yDim; row++) {
        for (var col = 0; col < orientation.xDim; col++) {
            if (orientation.rows[row] & 1 << col) {
                var block = document
                    .getElementById(tableBodyId)
                    .rows[thisPiece.y + orientation.yMin + row]
                    .cells[thisPiece.x + orientation.xMin + col];
                block.className = activeCellClass + ' ' + pieceClass + '-' + thisPiece.id;
            }
        }
    }
}

// spit out a replay
function drawReplay() {
    // encode the replay string for the user's benefit
    // UDLR
    var string = "";

    // replays must have an even number of moves in order
    // for the encoding to work correctly
    if (replayOut.length % 2 == 1) {
        replayOut.push("D");
    }

    // mark extra-depth games as such
    for (var i = 0; i < searchDepth; i++) {
        string += "#";
    }

    var transformPair = "";
    for (var i = 0; i < replayOut.length; i++) {
        transformPair += replayOut[i];

        // every two moves, append one more hex character
        // there is evidently no function to do this in JavaScript
        if (i % 2 == 1) {
            switch (transformPair) {
                case "LL":
                    s = "0";
                    break;
                case "LR":
                    s = "1";
                    break;
                case "LD":
                    s = "2";
                    break;
                case "LU":
                    s = "3";
                    break;
                case "RL":
                    s = "4";
                    break;
                case "RR":
                    s = "5";
                    break;
                case "RD":
                    s = "6";
                    break;
                case "RU":
                    s = "7";
                    break;
                case "DL":
                    s = "8";
                    break;
                case "DR":
                    s = "9";
                    break;
                case "DD":
                    s = "A";
                    break;
                case "DU":
                    s = "B";
                    break;
                case "UL":
                    s = "C";
                    break;
                case "UR":
                    s = "D";
                    break;
                case "UD":
                    s = "E";
                    break;
                case "UU":
                    s = "F";
                    break;
            }
            string += s;
            transformPair = "";
        }

        // add a space every 4 characters
        if (string.length % 5 == 4) {
            string += " ";
        }
    }

    // and put it out there
    document.getElementById("replayOut").innerHTML = "replay of last game: " + string;
}

// this is an utter hack because the
// "clear line" subroutine frequently gets called by the
// evil piece generator, outside of normal gameplay
function drawScore() {
    document.getElementById("score").innerHTML = liveWell.score;
    document.getElementById("level").innerHTML = Math.floor(liveWell.score / levelLines) + 1;

    var difficultyText;
    if (difficulty === 1) {
        difficultyText = 'Impossibru'
    } else if (difficulty < 1.5) {
        difficultyText = 'Extreme';
    } else if (difficulty < 2) {
        difficultyText = 'Hard';
    } else if (difficulty < 3) {
        difficultyText = 'Medium';
    } else if (difficulty < 5) {
        difficultyText = 'Easy';
    } else {
        difficultyText = 'Childs play';
    }
    document.getElementById("difficulty").innerHTML = difficultyText;
}

// draw a well
function drawWell(thisWell) {
    for (var col = 0; col < wellBlockWidth; col++) {
        for (var row = 0; row < wellBlockHeight; row++) {
            var block = document
                .getElementById(tableBodyId)
                .rows[row]
                .cells[col];
            if (thisWell.content[row] & (1 << col)) {
                block.className = activeCellClass + ' ' + pieceClass + '-' + liveWell.blocks[row][col];
            } else {
                block.className = liveWell.blocks[row][col];
//                block.className = cellClass;
            }
        }
    }
}

// generate a unique integer to describe the position and orientation
// of this piece
// x varies between -3 and (wellWidth-1) inclusive (range = wellWidth + 3)
// y varies between 0 and (wellDepth+2) inclusive (range = wellDepth + 3)
// o varies between 0 and 3 inclusive (range = 4)
function hashCode(x, y, o) {
    return 4 * ((wellBlockHeight + 3) * x + y) + o;
}

// accepts the input of a transformId and attempts to apply that
// transform to the live piece in the live well.
// returns false if the game is over afterwards,
// returns true otherwise
function inputHandler(transformId) {

    var newPiece = tryTransform(liveWell, livePiece, transformId);

    // transform failed?
    if (newPiece == null) {

        // piece has locked? better commit that live one then
        if (transformId == "D") {

            // alter the well, note the number of lines made
            addPiece(liveWell, livePiece);
            livePiece = null; // another may be generated later... if needed...
            drawScore();
        }
    }

    // transform succeeded
    else {
        livePiece = newPiece;
    }

    // update replayOut
    replayOut.push(transformId);

    // redraw well
    drawWell(liveWell);

    // is the game over?
    // it is impossible to get bits at row (bar - 2) or higher without getting a bit at row (bar - 1)
    // so there is only one line which we need to check
    if (liveWell.content[bar - 1] > 0) {
        stopFalling();

        // GAME OVER STUFF:
        drawReplay();
        return false;
    }

    // otherwise the game continues

    // no live piece? make a new one
    // suited to the new world, of course
    if (livePiece == null) {
        livePiece = worstPiece(liveWell);
        if (Math.random() * difficulty > 1) {
            livePiece.id = pickRandomProperty(pieces);
        }
    }

    drawPiece(livePiece);
    return true;
}

function inputKey(event) {

    // only handle one key at a time.
    // if another key may be pressed,
    // this will be reactivated later
    document.onkeydown = null;
    event = event || window.event; // add for IE
    var transformId = null;

    switch (event.keyCode) {
        case keyLeft:
            transformId = "L";
            break;
        case keyRight:
            transformId = "R";
            break;
        case keyDown:
            transformId = "D";
            resetFalling();
            break;
        case keyUp:
            transformId = "U";
            break;
        default:
            document.onkeydown = inputKey;
            return;
    }

    // make that move
    // transformId is sanitised
    var gameContinues = inputHandler(transformId);

    // optionally: continue the game
    if (gameContinues) {
        document.onkeydown = inputKey;
    }
}

// this has to be done recursively, sigh
function inputReplayStep() {
    var transformId = replayIn.shift();

    // ignore non-replay characters
    // so that transformId is sanitised
    while (transforms[transformId] == undefined && replayIn.length > 0) {
        transformId = replayIn.shift();
    }

    // make that move
    // transformId is sanitised
    var gameContinues = inputHandler(transformId);

    // optionally: continue the game
    if (gameContinues) {
        // if there is still replay left, time in another step from the replay
        // otherwise, allow the user to continue the game
        if (replayIn.length > 0) {
            replayTimeoutId = setTimeout("inputReplayStep();", 50);
        } else {
            document.onkeydown = inputKey;
        }
    }
}

// clear the field and get ready for a new game
function startGame(thisSearchDepth) {
    var selectedDifficulty = document.getElementById('difficulty-level').value;
    if (selectedDifficulty && difficultySettings[selectedDifficulty]) {
        difficulty = difficultySettings[selectedDifficulty];
    } else {
        difficulty = difficultySettings.impossibru;
    }

    // there may be a replay in progress, this
    // must be killed
    clearTimeout(replayTimeoutId);

    // set depth of search
    searchDepth = thisSearchDepth;

    clearField();

    // prepare to take user input
    document.onkeydown = inputKey;

    startFalling(0);
}

function startReplay() {
    stopFalling();

    // there may be a replay in progress, this
    // must be killed
    clearTimeout(replayTimeoutId);

    // disable user input while showing a replay
    document.onkeydown = null;

    // user inputs replay string
    var string = prompt() || ""; // change for IE

    // decode the string into a list of transforms
    // UDLR
    // "#" means "increase search depth"
    replayIn = [];
    searchDepth = 0;
    for (var i = 0; i < string.length; i++) {
        switch (string[i]) {
            case "0":
                replayIn.push("L", "L");
                break;
            case "1":
                replayIn.push("L", "R");
                break;
            case "2":
                replayIn.push("L", "D");
                break;
            case "3":
                replayIn.push("L", "U");
                break;
            case "4":
                replayIn.push("R", "L");
                break;
            case "5":
                replayIn.push("R", "R");
                break;
            case "6":
                replayIn.push("R", "D");
                break;
            case "7":
                replayIn.push("R", "U");
                break;
            case "8":
                replayIn.push("D", "L");
                break;
            case "9":
                replayIn.push("D", "R");
                break;
            case "A":
                replayIn.push("D", "D");
                break;
            case "B":
                replayIn.push("D", "U");
                break;
            case "C":
                replayIn.push("U", "L");
                break;
            case "D":
                replayIn.push("U", "R");
                break;
            case "E":
                replayIn.push("U", "D");
                break;
            case "F":
                replayIn.push("U", "U");
                break;
            case "#":
                searchDepth++;
            default:
                break;
        }
    }

    // GO
    clearField();

    // line up first step (will trigger own later steps)
    inputReplayStep();
}

// attempt to apply a transform to the current piece in the well.
// transform is successful: return a new, transformed piece
// transform fails: return null
function tryTransform(thisWell, thisPiece, transformId) {

    // can't alter in place
    var id = thisPiece.id;
    var x = thisPiece.x;
    var y = thisPiece.y;
    var o = thisPiece.o;

    // apply transform (very fast now)
    switch (transformId) {
        case "L":
            x--;
            break;
        case "R":
            x++;
            break;
        case "D":
            y++;
            break;
        case "U":
            o = (o + 1) % 4;
            break;
    }

    var orientation = orientations[id][o];
    var xActual = x + orientation.xMin;
    var yActual = y + orientation.yMin;

    if (
            xActual < 0                            // make sure not off left side
            || xActual + orientation.xDim > wellBlockWidth // make sure not off right side
            || yActual + orientation.yDim > wellBlockHeight // make sure not off bottom
            ) {
        return null;
    }

    // make sure there is NOTHING IN THE WAY
    // we do this by hunting for bit collisions
    for (var row = 0; row < orientation.rows.length; row++) { // 0 to 0, 1, 2 or 3 depending on vertical size of piece
        if (thisWell.content[yActual + row] & (orientation.rows[row] << xActual)) {
            return null;
        }
    }

    return {"id": id, "x": x, "y": y, "o": o};
}


// pick the worst piece that could be put into this well
// return the piece
// but not its rating
function worstPiece(thisWell) {

    // iterate over all the pieces getting ratings
    // select the lowest
    var worstRating = null;
    var worstId = null;

    // we already have a list of possible pieces to iterate over
    var startTime = new Date().getTime();
    for (var id in pieces) {
        var currentRating = bestWellRating(thisWell, id, searchDepth);

        // update worstRating
        if (worstRating == null || currentRating < worstRating) {
            worstRating = currentRating;
            worstId = id;
        }

        // return instantly upon finding a 0
        if (worstRating == 0) {
            break;
        }
    }

    return {
        "id": worstId,
        "x": Math.floor((wellBlockWidth - 4) / 2),
        "y": 0,
        "o": 0
    };
}

// pick the worst piece that could be put into this well
// return the rating of this piece
// but NOT the piece itself...
function worstPieceRating(thisWell, thisSearchDepth) {

    // iterate over all the pieces getting ratings
    // select the lowest
    var worstRating = null;

    // we already have a list of possible pieces to iterate over
    for (var id in pieces) {
        var currentRating = bestWellRating(thisWell, id, thisSearchDepth);
        if (worstRating == null || currentRating < worstRating) {
            worstRating = currentRating;
        }

        // if we have a 0 then that suffices, no point in searching further
        // (except for benchmarking purposes)
        if (worstRating == 0) {
            return 0;
        }
    }

    return worstRating;
}

function stopFalling() {
    if (fallIntervalId) {
        clearTimeout(fallIntervalId);
        fallIntervalId = null;
    }
}

function startFalling() {
    fallIntervalId = setInterval(fall, fallSpeed);
}

function restartFalling(level) {
    stopFalling();
    fallSpeed = fallSpeedLevels[Math.min(level, fallSpeedLevels.length - 1)];
    startFalling();
}

function resetFalling() {
    stopFalling();
    startFalling();
}

function fall() {
    inputKey({
        keyCode: keyDown
    });
}
