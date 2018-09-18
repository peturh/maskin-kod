/**
  Copyright (C) 2012-2016 by Autodesk, Inc.
  All rights reserved.

  OKUMA post processor configuration.

  $Revision: 41452 77a7922bf5f3df20b0b2879702c5e5d25f3f3586 $
  $Date: 2017-05-30 17:47:51 $

  FORKID {2F9AB8A9-6D4F-4087-81B1-3E14AE260F81}
*/

description = 'OKUMA OSP-E100M';
vendor = 'OKUMA';
vendorUrl = 'http://www.okuma.com';
legal = 'Copyright (C) 2012-2016 by Autodesk, Inc.';
certificationLevel = 2;
minimumRevision = 24000;

longDescription = "Milling post for OKUMA. Enable the 'useG16' property to do machine retracts in H0.";

extension = 'MIN';
setCodePage('ascii');

capabilities = CAPABILITY_MILLING;
tolerance = spatial(0.002, MM);

minimumChordLength = spatial(0.002, MM);
minimumCircularRadius = spatial(0.01, MM);
maximumCircularRadius = spatial(1000, MM);
minimumCircularSweep = toRad(0.01);
maximumCircularSweep = toRad(180);
allowHelicalMoves = true;
allowedCircularPlanes = undefined; // allow any circular motion

highFeedMapping = HIGH_FEED_NO_MAPPING; // must be set if axes are not synchronized
highFeedrate = (unit === IN) ? 100 : 10000;

// user-defined properties
properties = {
  cleanFactor: 3, // Cleaning time for air blow after using through tool coolant, prior to tool change. cleanFactor represents number of seconds for air blow through a 10mm tool. Blow time decreases exponentially with tool diameter
  writeMachine: true, // write machine
  writeTools: true, // writes the tools
  preloadTool: true, // preloads next tool on tool change if any
  showSequenceNumbers: false, // show sequence numbers
  sequenceNumberStart: 1, // first sequence number
  sequenceNumberIncrement: 1, // increment for sequence numbers
  optionalStop: true, // optional stop
  dwellAfterStop: 0, // specifies the time in seconds to dwell after a stop
  separateWordsWithSpace: true, // specifies that the words should be separated with a white space
  useParametricFeed: false, // specifies that feed should be output using Q values
  showNotes: false, // specifies that operation notes should be output.
  useG16: false // use G16 for machine retracts in H0
};

var mapCoolantTable = new Table(
  [9, 8, 339, 51, 12, 339, 9, 9, 9], {
    initial: COOLANT_OFF,
    force: true
  },
  'Invalid coolant mode'
);

var gFormat = createFormat({
  prefix: 'G',
  width: 2,
  zeropad: true,
  decimals: 0
});
var mFormat = createFormat({
  prefix: 'M',
  width: 2,
  zeropad: true,
  decimals: 0
});
var hFormat = createFormat({
  prefix: 'H',
  width: 2,
  zeropad: true,
  decimals: 0
});
var dFormat = createFormat({
  prefix: 'D',
  width: 2,
  zeropad: true,
  decimals: 0
});
var pFormat = createFormat({
  prefix: 'P',
  width: 2,
  zeropad: true,
  decimals: 0
});

var xyzFormat = createFormat({
  decimals: (unit == MM ? 3 : 4),
  forceDecimal: true
});
var abcFormat = createFormat({
  decimals: 3,
  forceDecimal: true,
  scale: DEG
});
var feedFormat = createFormat({
  decimals: (unit == MM ? 2 : 3)
});
var pitchFormat = createFormat({
  decimals: (unit == MM ? 3 : 4)
});
var toolFormat = createFormat({
  decimals: 0
});
var rpmFormat = createFormat({
  decimals: 0
});
var secFormat = createFormat({
  decimals: 3,
  forceDecimal: true
}); // seconds - range 0.001-99999.999
var milliFormat = createFormat({
  decimals: 0
}); // milliseconds // range 1-99999999
var taperFormat = createFormat({
  decimals: 1,
  scale: DEG
});

var xOutput = createVariable({
  prefix: 'X'
}, xyzFormat);
var yOutput = createVariable({
  prefix: 'Y'
}, xyzFormat);
var zOutput = createVariable({
  prefix: 'Z'
}, xyzFormat);
var aOutput = createVariable({
  prefix: 'A'
}, abcFormat);
var bOutput = createVariable({
  prefix: 'B'
}, abcFormat);
var cOutput = createVariable({
  prefix: 'C'
}, abcFormat);
var feedOutput = createVariable({
  prefix: 'F'
}, feedFormat);
var sOutput = createVariable({
  prefix: 'S',
  force: true
}, rpmFormat);
var dOutput = createVariable({}, dFormat);

// circular output
var iOutput = createReferenceVariable({
  prefix: 'I'
}, xyzFormat);
var jOutput = createReferenceVariable({
  prefix: 'J'
}, xyzFormat);
var kOutput = createReferenceVariable({
  prefix: 'K'
}, xyzFormat);

// cycle output
var z71Output = createVariable({
  prefix: 'Z',
  force: true
}, xyzFormat);

var gMotionModal = createModal({}, gFormat); // modal group 1 // G0-G3, ...
var gPlaneModal = createModal({
  onchange: function() {
    gMotionModal.reset();
  }
}, gFormat); // modal group 2 // G17-19
var gAbsIncModal = createModal({}, gFormat); // modal group 3 // G90-91
var gFeedModeModal = createModal({}, gFormat); // modal group 5 // G94-95
var gUnitModal = createModal({}, gFormat); // modal group 6 // G20-21
var gCycleModal = createModal({}, gFormat); // modal group 9 // G81, ...
var gRetractModal = createModal({}, gFormat); // modal group 10 // G98-99

var useG284 = true; // use G284 instead of G84

// fixed settings
var firstFeedParameter = 1;

var WARNING_WORK_OFFSET = 0;

// collected state
var sequenceNumber;
var currentWorkOffset;
var forceSpindleSpeed = false;
var activeMovements; // do not use by default
var currentFeedId;

/**
  Writes the specified block.
*/
function writeBlock() {
  if (properties.showSequenceNumbers) {
    writeWords2('N' + sequenceNumber, arguments);
    sequenceNumber += properties.sequenceNumberIncrement;
  } else {
    writeWords(arguments);
  }
}

/**
  Writes the specified optional block.
*/
function writeOptionalBlock() {
  if (properties.showSequenceNumbers) {
    var words = formatWords(arguments);
    if (words) {
      writeWords('/', 'N' + sequenceNumber, words);
      sequenceNumber += properties.sequenceNumberIncrement;
    }
  } else {
    writeWords2('/', arguments);
  }
}

function formatComment(text) {
  return '(' + String(text).replace(/[\(\)]/g, '') + ')';
}

/**
  Output a comment.
*/
function writeComment(text) {
  writeln(formatComment(text));
}

function onOpen() {
  if (false) { // note: setup your machine here
    var aAxis = createAxis({
      coordinate: 0,
      table: false,
      axis: [1, 0, 0],
      range: [-360, 360],
      preference: 1
    });
    var cAxis = createAxis({
      coordinate: 2,
      table: false,
      axis: [0, 0, 1],
      range: [-360, 360],
      preference: 1
    });
    machineConfiguration = new MachineConfiguration(aAxis, cAxis);

    setMachineConfiguration(machineConfiguration);
    optimizeMachineAngles2(0); // TCP mode
  }

  if (properties.useG16) {
    machineConfiguration.setRetractPlane(0);
  } else {
    machineConfiguration.setRetractPlane((unit == IN) ? 400 : 9999); // CNC would not fail but move to highest position
    machineConfiguration.setHomePositionX((unit == IN) ? 400 : -9999); // CNC would not fail but move to max position
    machineConfiguration.setHomePositionY((unit == IN) ? 400 : 9999); // CNC would not fail but move to max position
  }

  if (!machineConfiguration.isMachineCoordinate(0)) {
    aOutput.disable();
  }
  if (!machineConfiguration.isMachineCoordinate(1)) {
    bOutput.disable();
  }
  if (!machineConfiguration.isMachineCoordinate(2)) {
    cOutput.disable();
  }

  if (!properties.separateWordsWithSpace) {
    setWordSeparator('');
  }

  sequenceNumber = properties.sequenceNumberStart;

  if (programName) {
    if (programName.length > 8) {
      warning(localize('Program name exceeds maximum length.'));
    }
    programName = String(programName).toUpperCase();
    if (!isSafeText(programName, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ���_0123456789')) {
      error(localize('Program name contains invalid character(s).'));
    }
    if (programName[0] == 'O') {
      warning(localize('Using reserved program name.'));
    }
    writeln('(' + (programName) + ')');
  } else {
    error(localize('Program name has not been specified.'));
    return;
  }
  if (programComment) {
    writeComment(programComment);
  }

  // dump machine configuration
  var vendor = machineConfiguration.getVendor();
  var model = machineConfiguration.getModel();
  var description = machineConfiguration.getDescription();

  if (properties.writeMachine && (vendor || model || description)) {
    writeComment(localize('Machine'));
    if (vendor) {
      writeComment('  ' + localize('vendor') + ': ' + vendor);
    }
    if (model) {
      writeComment('  ' + localize('model') + ': ' + model);
    }
    if (description) {
      writeComment('  ' + localize('description') + ': ' + description);
    }
  }

  writeComment('Clean factor = ' + properties.cleanFactor);

  // dump tool information
  if (properties.writeTools) {
    var zRanges = {};
    if (is3D()) {
      var numberOfSections = getNumberOfSections();
      for (var i = 0; i < numberOfSections; ++i) {
        var section = getSection(i);
        var zRange = section.getGlobalZRange();
        var tool = section.getTool();
        if (zRanges[tool.number]) {
          zRanges[tool.number].expandToRange(zRange);
        } else {
          zRanges[tool.number] = zRange;
        }
      }
    }

    var tools = getToolTable();
    if (tools.getNumberOfTools() > 0) {
      for (var i = 0; i < tools.getNumberOfTools(); ++i) {
        var tool = tools.getTool(i);
        var comment = 'T' + toolFormat.format(tool.number) + ' ' +
          'D=' + xyzFormat.format(tool.diameter) + ' ' +
          localize('CR') + '=' + xyzFormat.format(tool.cornerRadius);
        if ((tool.taperAngle > 0) && (tool.taperAngle < Math.PI)) {
          comment += ' ' + localize('TAPER') + '=' + taperFormat.format(tool.taperAngle) + localize('deg');
        }
        if (zRanges[tool.number]) {
          comment += ' - ' + localize('ZMIN') + '=' + xyzFormat.format(zRanges[tool.number].getMinimum());
        }
        comment += ' - ' + getToolTypeName(tool.type);
        writeComment(comment);
      }
    }
  }

  if (false) {
    // check for duplicate tool number
    for (var i = 0; i < getNumberOfSections(); ++i) {
      var sectioni = getSection(i);
      var tooli = sectioni.getTool();
      for (var j = i + 1; j < getNumberOfSections(); ++j) {
        var sectionj = getSection(j);
        var toolj = sectionj.getTool();
        if (tooli.number == toolj.number) {
          if (xyzFormat.areDifferent(tooli.diameter, toolj.diameter) ||
            xyzFormat.areDifferent(tooli.cornerRadius, toolj.cornerRadius) ||
            abcFormat.areDifferent(tooli.taperAngle, toolj.taperAngle) ||
            (tooli.numberOfFlutes != toolj.numberOfFlutes)) {
            error(
              subst(
                localize("Using the same tool number for different cutter geometry for operation '%1' and '%2'."),
                sectioni.hasParameter('operation-comment') ? sectioni.getParameter('operation-comment') : ('#' + (i + 1)),
                sectionj.hasParameter('operation-comment') ? sectionj.getParameter('operation-comment') : ('#' + (j + 1))
              )
            );
            return;
          }
        }
      }
    }
  }

  if ((getNumberOfSections() > 0) && (getSection(0).workOffset == 0)) {
    for (var i = 0; i < getNumberOfSections(); ++i) {
      if (getSection(i).workOffset > 0) {
        error(localize('Using multiple work offsets is not possible if the initial work offset is 0.'));
        return;
      }
    }
  }

  // absolute coordinates and feed per min
  writeBlock(gFormat.format(40), gCycleModal.format(80), gAbsIncModal.format(90), gFeedModeModal.format(94), gPlaneModal.format(17));

  switch (unit) {
    case IN:
      writeBlock(gUnitModal.format(20));
      break;
    case MM:
      writeBlock(gUnitModal.format(21));
      break;
  }
}

function onComment(message) {
  writeComment(message);
}

/** Force output of X, Y, and Z. */
function forceXYZ() {
  xOutput.reset();
  yOutput.reset();
  zOutput.reset();
}

/** Force output of A, B, and C. */
function forceABC() {
  aOutput.reset();
  bOutput.reset();
  cOutput.reset();
}

function forceFeed() {
  currentFeedId = undefined;
  feedOutput.reset();
}

/** Force output of X, Y, Z, A, B, C, and F on next output. */
function forceAny() {
  forceXYZ();
  forceABC();
  forceFeed();
}

function FeedContext(id, description, feed) {
  this.id = id;
  this.description = description;
  this.feed = feed;
}

function getFeed(f) {
  if (activeMovements) {
    var feedContext = activeMovements[movement];
    if (feedContext != undefined) {
      if (!feedFormat.areDifferent(feedContext.feed, f)) {
        if (feedContext.id == currentFeedId) {
          return ''; // nothing has changed
        }
        forceFeed();
        currentFeedId = feedContext.id;
        return 'F=PF' + (firstFeedParameter + feedContext.id);
      }
    }
    currentFeedId = undefined; // force Q feed next time
  }
  return feedOutput.format(f); // use feed value
}

function initializeActiveFeeds() {
  activeMovements = new Array();
  var movements = currentSection.getMovements();

  var id = 0;
  var activeFeeds = new Array();
  if (hasParameter('operation:tool_feedCutting')) {
    if (movements & ((1 << MOVEMENT_CUTTING) | (1 << MOVEMENT_LINK_TRANSITION) | (1 << MOVEMENT_EXTENDED))) {
      var feedContext = new FeedContext(id, localize('Cutting'), getParameter('operation:tool_feedCutting'));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_CUTTING] = feedContext;
      activeMovements[MOVEMENT_LINK_TRANSITION] = feedContext;
      activeMovements[MOVEMENT_EXTENDED] = feedContext;
    }
    ++id;
    if (movements & (1 << MOVEMENT_PREDRILL)) {
      feedContext = new FeedContext(id, localize('Predrilling'), getParameter('operation:tool_feedCutting'));
      activeMovements[MOVEMENT_PREDRILL] = feedContext;
      activeFeeds.push(feedContext);
    }
    ++id;
  }

  if (hasParameter('operation:finishFeedrate')) {
    if (movements & (1 << MOVEMENT_FINISH_CUTTING)) {
      var feedContext = new FeedContext(id, localize('Finish'), getParameter('operation:finishFeedrate'));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_FINISH_CUTTING] = feedContext;
    }
    ++id;
  } else if (hasParameter('operation:tool_feedCutting')) {
    if (movements & (1 << MOVEMENT_FINISH_CUTTING)) {
      var feedContext = new FeedContext(id, localize('Finish'), getParameter('operation:tool_feedCutting'));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_FINISH_CUTTING] = feedContext;
    }
    ++id;
  }

  if (hasParameter('operation:tool_feedEntry')) {
    if (movements & (1 << MOVEMENT_LEAD_IN)) {
      var feedContext = new FeedContext(id, localize('Entry'), getParameter('operation:tool_feedEntry'));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LEAD_IN] = feedContext;
    }
    ++id;
  }

  if (hasParameter('operation:tool_feedExit')) {
    if (movements & (1 << MOVEMENT_LEAD_OUT)) {
      var feedContext = new FeedContext(id, localize('Exit'), getParameter('operation:tool_feedExit'));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LEAD_OUT] = feedContext;
    }
    ++id;
  }

  if (hasParameter('operation:noEngagementFeedrate')) {
    if (movements & (1 << MOVEMENT_LINK_DIRECT)) {
      var feedContext = new FeedContext(id, localize('Direct'), getParameter('operation:noEngagementFeedrate'));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LINK_DIRECT] = feedContext;
    }
    ++id;
  } else if (hasParameter('operation:tool_feedCutting') &&
    hasParameter('operation:tool_feedEntry') &&
    hasParameter('operation:tool_feedExit')) {
    if (movements & (1 << MOVEMENT_LINK_DIRECT)) {
      var feedContext = new FeedContext(id, localize('Direct'), Math.max(getParameter('operation:tool_feedCutting'), getParameter('operation:tool_feedEntry'), getParameter('operation:tool_feedExit')));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LINK_DIRECT] = feedContext;
    }
    ++id;
  }

  if (hasParameter('operation:reducedFeedrate')) {
    if (movements & (1 << MOVEMENT_REDUCED)) {
      var feedContext = new FeedContext(id, localize('Reduced'), getParameter('operation:reducedFeedrate'));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_REDUCED] = feedContext;
    }
    ++id;
  }

  if (hasParameter('operation:tool_feedRamp')) {
    if (movements & ((1 << MOVEMENT_RAMP) | (1 << MOVEMENT_RAMP_HELIX) | (1 << MOVEMENT_RAMP_PROFILE) | (1 << MOVEMENT_RAMP_ZIG_ZAG))) {
      var feedContext = new FeedContext(id, localize('Ramping'), getParameter('operation:tool_feedRamp'));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_RAMP] = feedContext;
      activeMovements[MOVEMENT_RAMP_HELIX] = feedContext;
      activeMovements[MOVEMENT_RAMP_PROFILE] = feedContext;
      activeMovements[MOVEMENT_RAMP_ZIG_ZAG] = feedContext;
    }
    ++id;
  }
  if (hasParameter('operation:tool_feedPlunge')) {
    if (movements & (1 << MOVEMENT_PLUNGE)) {
      var feedContext = new FeedContext(id, localize('Plunge'), getParameter('operation:tool_feedPlunge'));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_PLUNGE] = feedContext;
    }
    ++id;
  }
  if (true) { // high feed
    if (movements & (1 << MOVEMENT_HIGH_FEED)) {
      var feedContext = new FeedContext(id, localize('High Feed'), this.highFeedrate);
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_HIGH_FEED] = feedContext;
    }
    ++id;
  }

  for (var i = 0; i < activeFeeds.length; ++i) {
    var feedContext = activeFeeds[i];
    writeBlock('PF' + (firstFeedParameter + feedContext.id) + '=' + feedFormat.format(feedContext.feed), formatComment(feedContext.description));
  }
}

var currentWorkPlaneABC = undefined;

function forceWorkPlane() {
  currentWorkPlaneABC = undefined;
}

function setWorkPlane(abc) {
  if (!machineConfiguration.isMultiAxisConfiguration()) {
    return; // ignore
  }

  if (!((currentWorkPlaneABC == undefined) ||
      abcFormat.areDifferent(abc.x, currentWorkPlaneABC.x) ||
      abcFormat.areDifferent(abc.y, currentWorkPlaneABC.y) ||
      abcFormat.areDifferent(abc.z, currentWorkPlaneABC.z))) {
    return; // no change
  }

  onCommand(COMMAND_UNLOCK_MULTI_AXIS);

  // NOTE: add retract here

  writeBlock(
    gMotionModal.format(0),
    conditional(machineConfiguration.isMachineCoordinate(0), 'A' + abcFormat.format(abc.x)),
    conditional(machineConfiguration.isMachineCoordinate(1), 'B' + abcFormat.format(abc.y)),
    conditional(machineConfiguration.isMachineCoordinate(2), 'C' + abcFormat.format(abc.z))
  );

  onCommand(COMMAND_LOCK_MULTI_AXIS);

  currentWorkPlaneABC = abc;
}

var closestABC = false; // choose closest machine angles
var currentMachineABC;

function getWorkPlaneMachineABC(workPlane) {
  var W = workPlane; // map to global frame

  var abc = machineConfiguration.getABC(W);
  if (closestABC) {
    if (currentMachineABC) {
      abc = machineConfiguration.remapToABC(abc, currentMachineABC);
    } else {
      abc = machineConfiguration.getPreferredABC(abc);
    }
  } else {
    abc = machineConfiguration.getPreferredABC(abc);
  }

  try {
    abc = machineConfiguration.remapABC(abc);
    currentMachineABC = abc;
  } catch (e) {
    error(
      localize('Machine angles not supported') + ':' +
      conditional(machineConfiguration.isMachineCoordinate(0), ' A' + abcFormat.format(abc.x)) +
      conditional(machineConfiguration.isMachineCoordinate(1), ' B' + abcFormat.format(abc.y)) +
      conditional(machineConfiguration.isMachineCoordinate(2), ' C' + abcFormat.format(abc.z))
    );
  }

  var direction = machineConfiguration.getDirection(abc);
  if (!isSameDirection(direction, W.forward)) {
    error(localize('Orientation not supported.'));
  }

  if (!machineConfiguration.isABCSupported(abc)) {
    error(
      localize('Work plane is not supported') + ':' +
      conditional(machineConfiguration.isMachineCoordinate(0), ' A' + abcFormat.format(abc.x)) +
      conditional(machineConfiguration.isMachineCoordinate(1), ' B' + abcFormat.format(abc.y)) +
      conditional(machineConfiguration.isMachineCoordinate(2), ' C' + abcFormat.format(abc.z))
    );
  }

  var tcp = true;
  if (tcp) {
    setRotation(W); // TCP mode
  } else {
    var O = machineConfiguration.getOrientation(abc);
    var R = machineConfiguration.getRemainingOrientation(abc, W);
    setRotation(R);
  }

  return abc;
}

function onSection() {
  var insertToolCall = isFirstSection() ||
    currentSection.getForceToolChange && currentSection.getForceToolChange() ||
    (tool.number != getPreviousSection().getTool().number);

  var retracted = false; // specifies that the tool has been retracted to the safe plane
  var newWorkOffset = isFirstSection() ||
    (getPreviousSection().workOffset != currentSection.workOffset); // work offset changes
  var newWorkPlane = isFirstSection() ||
    !isSameDirection(getPreviousSection().getGlobalFinalToolAxis(), currentSection.getGlobalInitialToolAxis());
  if (insertToolCall || newWorkOffset || newWorkPlane) {
    // stop spindle before retract during tool change
    if (insertToolCall && !isFirstSection()) {
      onCommand(COMMAND_STOP_SPINDLE);
    }

    // retract to safe plane
    retracted = true;
    if (properties.useG16) {
      writeBlock(gFormat.format(16), hFormat.format(0), gMotionModal.format(0), 'Z' + xyzFormat.format(machineConfiguration.getRetractPlane()));
    } else {
      // must move to highest position
      writeBlock(gMotionModal.format(0), 'Z' + xyzFormat.format(machineConfiguration.getRetractPlane()));
    }
    zOutput.reset();
  }

  writeln('');

  if (hasParameter('operation-comment')) {
    var comment = getParameter('operation-comment');
    if (comment) {
      writeComment(comment);
    }
  }

  if (properties.showNotes && hasParameter('notes')) {
    var notes = getParameter('notes');
    if (notes) {
      var lines = String(notes).split('\n');
      var r1 = new RegExp('^[\\s]+', 'g');
      var r2 = new RegExp('[\\s]+$', 'g');
      for (line in lines) {
        var comment = lines[line].replace(r1, '').replace(r2, '');
        if (comment) {
          writeComment(comment);
        }
      }
    }
  }

  if (insertToolCall) {
    forceWorkPlane();
    retracted = true;
    onCommand(COMMAND_COOLANT_OFF);
    // Bl�ser rent verktyg som anv�nt Through Tool Coolant innan n�sta verktyg v�xlas in. cleanFactor motsvarar tiden i sekunder f�r bl�sning av ett verktyg med dia 10mm. Bl�stiden avtar kvadratiskt med �kande verktygsdiameter
    if (!isFirstSection()) {
      if (getPreviousSection().getTool().coolant == 8 || getPreviousSection().getTool().coolant == 3) {
        writeComment('Air blow to clean tool from coolant');
        var cleanToolDiameter = getPreviousSection().getTool().diameter;
        var cleanToolDiameterSquared = cleanToolDiameter * cleanToolDiameter;
        var cleanToolTime = 100 * properties.cleanFactor / cleanToolDiameterSquared;
        writeBlock(mFormat.format(339));
        writeBlock(gFormat.format(4), pFormat.format(cleanToolTime));
        writeBlock(mFormat.format(9));
        writeComment('End of cleaning');
      }
    }

    if (!isFirstSection() && properties.optionalStop) {
      onCommand(COMMAND_OPTIONAL_STOP);
    }

    if (tool.number > 9999) {
      warning(localize('Tool number exceeds maximum value.'));
    }

    if (properties.preloadTool && !isFirstSection()) {
      writeComment('T' + toolFormat.format(tool.number));
      writeBlock(mFormat.format(6));
    } else {
      writeBlock('T' + toolFormat.format(tool.number), mFormat.format(6));
    }

    if (tool.comment) {
      writeComment(tool.comment);
    }
    var showToolZMin = false;
    if (showToolZMin) {
      if (is3D()) {
        var numberOfSections = getNumberOfSections();
        var zRange = currentSection.getGlobalZRange();
        var number = tool.number;
        for (var i = currentSection.getId() + 1; i < numberOfSections; ++i) {
          var section = getSection(i);
          if (section.getTool().number != number) {
            break;
          }
          zRange.expandToRange(section.getGlobalZRange());
        }
        writeComment(localize('ZMIN') + '=' + xyzFormat.format(zRange.getMinimum()));
      }
    }

    if (properties.preloadTool) {
      var nextTool = getNextTool(tool.number);
      if (nextTool) {
        writeBlock('T' + toolFormat.format(nextTool.number));
      }
    }
  }

  if (insertToolCall ||
    forceSpindleSpeed ||
    isFirstSection() ||
    (rpmFormat.areDifferent(tool.spindleRPM, sOutput.getCurrent())) ||
    (tool.clockwise != getPreviousSection().getTool().clockwise)) {
    forceSpindleSpeed = false;

    if (tool.spindleRPM < 1) {
      error(localize('Spindle speed out of range.'));
      return;
    }
    if (tool.spindleRPM > 65535) {
      warning(localize('Spindle speed exceeds maximum value.'));
    }
    writeBlock(
      sOutput.format(tool.spindleRPM), mFormat.format(tool.clockwise ? 3 : 4)
    );
  }

  // wcs
  if (insertToolCall) { // force work offset when changing tool
    currentWorkOffset = undefined;
  }
  var workOffset = currentSection.workOffset;
  if (workOffset == 0) {
    warningOnce(
      localize('Work offset has not been specified. Using ' + formatWords(gFormat.format(15), hFormat.format(1)) + ' as WCS.'),
      WARNING_WORK_OFFSET
    );
    workOffset = 1;
  }
  if (workOffset > 0) {
    if (workOffset > 200) {
      error(localize('Work offset out of range.'));
    }
    if (workOffset != currentWorkOffset) {
      writeBlock(gFormat.format(15), hFormat.format(workOffset));
      currentWorkOffset = workOffset;
    }
  }

  forceXYZ();
  gAbsIncModal.reset();

  if (machineConfiguration.isMultiAxisConfiguration()) { // use 5-axis indexing for multi-axis mode
    // set working plane after datum shift

    var abc = new Vector(0, 0, 0);
    if (currentSection.isMultiAxis()) {
      forceWorkPlane();
      cancelTransformation();
    } else {
      abc = getWorkPlaneMachineABC(currentSection.workPlane);
    }
    setWorkPlane(abc);
  } else { // pure 3D
    var remaining = currentSection.workPlane;
    if (!isSameDirection(remaining.forward, new Vector(0, 0, 1))) {
      error(localize('Tool orientation is not supported.'));
      return;
    }
    setRotation(remaining);
  }

  // set coolant after we have positioned at Z
  {
    var c = mapCoolantTable.lookup(tool.coolant);
    if (c) {
      var coolant = tool.coolant;
      if (coolant == 7) {
        writeln('(Coolant: Flood and mist)');
        writeBlock(mFormat.format(8));
        writeBlock(mFormat.format(7));
      } else if (coolant == 8) {
        writeln('(Coolant: Flood and through tool)');
        writeBlock(mFormat.format(8));
        writeBlock(mFormat.format(51));
      } else {
        writeBlock(mFormat.format(c));
      }
    } else {
      warning(localize('Coolant not supported.'));
    }
  }

  forceAny();
  gMotionModal.reset();

  var initialPosition = getFramePosition(currentSection.getInitialPosition());
  if (!retracted) {
    if (getCurrentPosition().z < initialPosition.z) {
      writeBlock(gMotionModal.format(0), zOutput.format(initialPosition.z));
    }
  }

  var lengthOffset = tool.lengthOffset;
  if (lengthOffset > 300) {
    error(localize('Length offset out of range.'));
    return;
  }

  writeBlock(gPlaneModal.format(17));

  if (!machineConfiguration.isHeadConfiguration()) {
    writeBlock(gMotionModal.format(0), xOutput.format(initialPosition.x), yOutput.format(initialPosition.y));
    writeBlock(gMotionModal.format(0), gFormat.format(56), zOutput.format(initialPosition.z), hFormat.format(lengthOffset));
  } else {
    writeBlock(
      gMotionModal.format(0),
      gFormat.format(56), xOutput.format(initialPosition.x),
      yOutput.format(initialPosition.y),
      zOutput.format(initialPosition.z), hFormat.format(lengthOffset)
    );
  }

  if (properties.useParametricFeed &&
    hasParameter('operation-strategy') &&
    (getParameter('operation-strategy') != 'drill') && // legacy
    !(currentSection.hasAnyCycle && currentSection.hasAnyCycle())) {
    if (!insertToolCall &&
      activeMovements &&
      (getCurrentSectionId() > 0) &&
      ((getPreviousSection().getPatternId() == currentSection.getPatternId()) && (currentSection.getPatternId() != 0))) {
      // use the current feeds
    } else {
      initializeActiveFeeds();
    }
  } else {
    activeMovements = undefined;
  }
}

function onDwell(seconds) {
  seconds = clamp(0.001, seconds, 99999.999);
  // unit is set in the machine
  writeBlock(gFeedModeModal.format(94), gFormat.format(4), 'F' + secFormat.format(seconds));
}

function onSpindleSpeed(spindleSpeed) {
  writeBlock(sOutput.format(spindleSpeed));
}

function onCycle() {
  writeBlock(gPlaneModal.format(17));
}

function getCommonCycle(x, y, z, r) {
  forceXYZ();
  return [xOutput.format(x), yOutput.format(y),
    zOutput.format(z),
    'R' + xyzFormat.format(r)
  ];
}

function onCyclePoint(x, y, z) {
  if (isFirstCyclePoint()) {
    repositionToCycleClearance(cycle, x, y, z);

    // return to initial Z which is clearance plane and set absolute mode
    var g71 = z71Output.format(cycle.clearance);
    if (g71) {
      g71 = formatWords(gFormat.format(71), g71);
    }
    // NCYL

    var F = cycle.feedrate;
    var P = (cycle.dwell == 0) ? 0 : clamp(1, cycle.dwell * 1, 99999999); // in milliseconds

    switch (cycleType) {
      case 'drilling':
        if (g71) {
          writeBlock(g71);
        }
        writeBlock(
          gPlaneModal.format(17), gAbsIncModal.format(90), gCycleModal.format(81),
          getCommonCycle(x, y, z, cycle.retract),
          feedOutput.format(F), mFormat.format(53)
        );
        break;
      case 'counter-boring':
        if (g71) {
          writeBlock(g71);
        }
        writeBlock(
          gPlaneModal.format(17), gAbsIncModal.format(90), gCycleModal.format(82),
          getCommonCycle(x, y, z, cycle.retract),
          conditional(P > 0, 'P' + milliFormat.format(P)),
          feedOutput.format(F), mFormat.format(53)
        );
        break;
      case 'chip-breaking':
        if (g71) {
          writeBlock(g71);
        }
        writeBlock(
          gPlaneModal.format(17), gAbsIncModal.format(90), gCycleModal.format(73),
          getCommonCycle(x, y, z, cycle.retract),
          conditional(P > 0, 'P' + milliFormat.format(P)),
          'Q' + xyzFormat.format(cycle.incrementalDepth),
          feedOutput.format(F), mFormat.format(53)
        );
        break;
      case 'deep-drilling':
        if (g71) {
          writeBlock(g71);
        }
        writeBlock(
          gPlaneModal.format(17), gAbsIncModal.format(90), gCycleModal.format(83),
          getCommonCycle(x, y, z, cycle.retract),
          'Q' + xyzFormat.format(cycle.incrementalDepth),
          conditional(P > 0, 'P' + milliFormat.format(P)),
          feedOutput.format(F), mFormat.format(53)
        );
        break;
      case 'tapping':
        if (!F) {
          F = tool.getTappingFeedrate();
        }
        if (g71) {
          writeBlock(g71);
        }
        writeBlock(
          gPlaneModal.format(17), gAbsIncModal.format(90), gCycleModal.format((tool.type == TOOL_TAP_LEFT_HAND) ? 74 : (useG284 ? 284 : 84)),
          getCommonCycle(x, y, z, cycle.retract),
          feedOutput.format(F),
          mFormat.format(53)
        );
        break;
      case 'left-tapping':
        if (!F) {
          F = tool.getTappingFeedrate();
        }
        if (g71) {
          writeBlock(g71);
        }
        writeBlock(
          gPlaneModal.format(17), gAbsIncModal.format(90), gCycleModal.format(74),
          getCommonCycle(x, y, z, cycle.retract),
          feedOutput.format(F),
          mFormat.format(53)
        );
        break;
      case 'right-tapping':
        if (!F) {
          F = tool.getTappingFeedrate();
        }
        if (g71) {
          writeBlock(g71);
        }
        writeBlock(
          gPlaneModal.format(17), gAbsIncModal.format(90), gCycleModal.format(useG284 ? 284 : 84),
          getCommonCycle(x, y, z, cycle.retract),
          feedOutput.format(F),
          mFormat.format(53)
        );
        break;
      case 'tapping-with-chip-breaking':
      case 'left-tapping-with-chip-breaking':
      case 'right-tapping-with-chip-breaking':
        if (!F) {
          F = tool.getTappingFeedrate();
        }
        if (g71) {
          writeBlock(g71);
        }
        // K is retract amount
        writeBlock(
          gPlaneModal.format(17), gAbsIncModal.format(90), gCycleModal.format((tool.type == TOOL_TAP_LEFT_HAND ? 273 : 283)),
          gFeedModeModal.format(95), // feed per revolution
          getCommonCycle(x, y, z, cycle.retract),
          conditional(P > 0, 'P' + secFormat.format(P / 1000.0)),
          'Q' + xyzFormat.format(cycle.incrementalDepth),
          'F' + pitchFormat.format((gFeedModeModal.getCurrent() == 95) ? tool.getThreadPitch() : F), // for G95 F is pitch, for G94 F is pitch*spindle rpm
          sOutput.format(tool.spindleRPM),
          'E0', // spindle position
          mFormat.format(53)
        );
        forceFeed();
        break;
      case 'fine-boring':
        // TAG: use I/J for shift
        if (g71) {
          writeBlock(g71);
        }
        writeBlock(
          gPlaneModal.format(17), gAbsIncModal.format(90), gCycleModal.format(76),
          getCommonCycle(x, y, z, cycle.retract),
          'Q' + xyzFormat.format(cycle.shift),
          conditional(P > 0, 'P' + milliFormat.format(P)),
          feedOutput.format(F), mFormat.format(53)
        );
        break;
      case 'back-boring':
        // TAG: use I/J for shift
        if (g71) {
          writeBlock(g71);
        }
        var dx = (gPlaneModal.getCurrent() == 19) ? cycle.backBoreDistance : 0;
        var dy = (gPlaneModal.getCurrent() == 18) ? cycle.backBoreDistance : 0;
        var dz = (gPlaneModal.getCurrent() == 17) ? cycle.backBoreDistance : 0;
        writeBlock(
          gPlaneModal.format(17), gRetractModal.format(98), gAbsIncModal.format(90), gCycleModal.format(87),
          getCommonCycle(x - dx, y - dy, z - dz, cycle.bottom),
          'Q' + xyzFormat.format(cycle.shift),
          conditional(P > 0, 'P' + milliFormat.format(P)),
          feedOutput.format(F), mFormat.format(53)
        );
        break;
      case 'reaming':
        var FA = cycle.retractFeedrate;
        if (g71) {
          writeBlock(g71);
        }
        writeBlock(
          gPlaneModal.format(17), gAbsIncModal.format(90), gCycleModal.format(85),
          getCommonCycle(x, y, z, cycle.retract),
          conditional(P > 0, 'P' + milliFormat.format(P)),
          feedOutput.format(F),
          conditional(FA != F, 'FA=' + feedFormat.format(FA)), mFormat.format(53)
        );
        break;
      case 'stop-boring':
        if (g71) {
          writeBlock(g71);
        }
        writeBlock(
          gPlaneModal.format(17), gAbsIncModal.format(90), gCycleModal.format(86),
          getCommonCycle(x, y, z, cycle.retract),
          conditional(P > 0, 'P' + milliFormat.format(P)),
          feedOutput.format(F), mFormat.format(53)
        );
        if (properties.dwellAfterStop > 0) {
          // make sure spindle reaches full spindle speed
          var seconds = clamp(0.001, properties.dwellAfterStop, 99999.999);
          writeBlock(gFormat.format(4), 'F' + secFormat.format(seconds));
        }
        break;
      case 'manual-boring':
        expandCyclePoint(x, y, z);
        break;
      case 'boring':
        var FA = cycle.retractFeedrate;
        if (g71) {
          writeBlock(g71);
        }
        writeBlock(
          gPlaneModal.format(17), gAbsIncModal.format(90), gCycleModal.format(89),
          getCommonCycle(x, y, z, cycle.retract),
          conditional(P > 0, 'P' + milliFormat.format(P)),
          feedOutput.format(F),
          conditional(FA != F, 'FA=' + feedFormat.format(FA)), mFormat.format(53)
        );
        break;
      default:
        expandCyclePoint(x, y, z);
    }
  } else {
    if (cycleExpanded) {
      expandCyclePoint(x, y, z);
    } else {
      var _x = xOutput.format(x);
      var _y = yOutput.format(y);
      if (_x || _y) {
        writeBlock(_x, _y);
        // we could add dwell here to make sure spindle reaches full spindle speed if the spindle has been stopped
      }
    }
  }
}

function onCycleEnd() {
  if (!cycleExpanded) {
    gMotionModal.reset();
    zOutput.reset();
    writeBlock(gMotionModal.format(0), zOutput.format(getCurrentPosition().z)); // avoid spindle stop
    gCycleModal.reset();
    // writeBlock(gCycleModal.format(80)); // not good since it stops spindle
  }
}

var pendingRadiusCompensation = -1;

function onRadiusCompensation() {
  pendingRadiusCompensation = radiusCompensation;
}

function onRapid(_x, _y, _z) {
  var x = xOutput.format(_x);
  var y = yOutput.format(_y);
  var z = zOutput.format(_z);
  if (x || y || z) {
    if (pendingRadiusCompensation >= 0) {
      error(localize('Radius compensation mode cannot be changed at rapid traversal.'));
    }
    writeBlock(gMotionModal.format(0), x, y, z);
    forceFeed();
  }
}

function onLinear(_x, _y, _z, feed) {
  var x = xOutput.format(_x);
  var y = yOutput.format(_y);
  var z = zOutput.format(_z);
  var f = getFeed(feed);
  if (x || y || z) {
    if (pendingRadiusCompensation >= 0) {
      pendingRadiusCompensation = -1;
      var d = tool.diameterOffset;
      if (d > 300) {
        warning(localize('The diameter offset exceeds the maximum value.'));
      }
      writeBlock(gPlaneModal.format(17));
      switch (radiusCompensation) {
        case RADIUS_COMPENSATION_LEFT:
          dOutput.reset();
          writeBlock(gMotionModal.format(1), gFormat.format(41), x, y, z, dOutput.format(d), f);
          break;
        case RADIUS_COMPENSATION_RIGHT:
          dOutput.reset();
          writeBlock(gMotionModal.format(1), gFormat.format(42), x, y, z, dOutput.format(d), f);
          break;
        default:
          writeBlock(gMotionModal.format(1), gFormat.format(40), x, y, z, f);
      }
    } else {
      writeBlock(gMotionModal.format(1), x, y, z, f);
    }
  } else if (f) {
    if (getNextRecord().isMotion()) { // try not to output feed without motion
      forceFeed(); // force feed on next line
    } else {
      writeBlock(gMotionModal.format(1), f);
    }
  }
}

function onRapid5D(_x, _y, _z, _a, _b, _c) {
  if (!currentSection.isOptimizedForMachine()) {
    error(localize('This post configuration has not been customized for 5-axis simultaneous toolpath.'));
    return;
  }
  if (pendingRadiusCompensation >= 0) {
    error(localize('Radius compensation mode cannot be changed at rapid traversal.'));
    return;
  }
  var x = xOutput.format(_x);
  var y = yOutput.format(_y);
  var z = zOutput.format(_z);
  var a = aOutput.format(_a);
  var b = bOutput.format(_b);
  var c = cOutput.format(_c);
  writeBlock(gMotionModal.format(0), x, y, z, a, b, c);
  forceFeed();
}

function onLinear5D(_x, _y, _z, _a, _b, _c, feed) {
  if (!currentSection.isOptimizedForMachine()) {
    error(localize('This post configuration has not been customized for 5-axis simultaneous toolpath.'));
    return;
  }
  if (pendingRadiusCompensation >= 0) {
    error(localize('Radius compensation cannot be activated/deactivated for 5-axis move.'));
    return;
  }

  forceXYZ();
  forceABC();
  var x = xOutput.format(_x);
  var y = yOutput.format(_y);
  var z = zOutput.format(_z);
  var a = aOutput.format(_a);
  var b = bOutput.format(_b);
  var c = cOutput.format(_c);
  var f = getFeed(feed);
  if (x || y || z || a || b || c) {
    writeBlock(gMotionModal.format(1), x, y, z, a, b, c, f);
  } else if (f) {
    if (getNextRecord().isMotion()) { // try not to output feed without motion
      forceFeed(); // force feed on next line
    } else {
      writeBlock(gMotionModal.format(1), f);
    }
  }
}

function onCircular(clockwise, cx, cy, cz, x, y, z, feed) {
  if (pendingRadiusCompensation >= 0) {
    error(localize('Radius compensation cannot be activated/deactivated for a circular move.'));
    return;
  }

  var start = getCurrentPosition();

  if (isFullCircle()) {
    if (isHelical()) {
      linearize(tolerance);
      return;
    }
    switch (getCircularPlane()) {
      case PLANE_XY:
        writeBlock(gPlaneModal.format(17), gMotionModal.format(clockwise ? 2 : 3), iOutput.format(cx - start.x, 0), jOutput.format(cy - start.y, 0), getFeed(feed));
        break;
      case PLANE_ZX:
        writeBlock(gPlaneModal.format(18), gMotionModal.format(clockwise ? 2 : 3), iOutput.format(cx - start.x, 0), kOutput.format(cz - start.z, 0), getFeed(feed));
        break;
      case PLANE_YZ:
        writeBlock(gPlaneModal.format(19), gMotionModal.format(clockwise ? 2 : 3), jOutput.format(cy - start.y, 0), kOutput.format(cz - start.z, 0), getFeed(feed));
        break;
      default:
        linearize(tolerance);
    }
  } else {
    // helical motion is supported for all 3 planes
    // the feedrate along plane normal is - (helical height/arc length * feedrate)
    switch (getCircularPlane()) {
      case PLANE_XY:
        writeBlock(gPlaneModal.format(17), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), iOutput.format(cx - start.x, 0), jOutput.format(cy - start.y, 0), getFeed(feed));
        break;
      case PLANE_ZX:
        writeBlock(gPlaneModal.format(18), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), iOutput.format(cx - start.x, 0), kOutput.format(cz - start.z, 0), getFeed(feed));
        break;
      case PLANE_YZ:
        writeBlock(gPlaneModal.format(19), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), jOutput.format(cy - start.y, 0), kOutput.format(cz - start.z, 0), getFeed(feed));
        break;
      default:
        linearize(tolerance);
    }
  }
}

var mapCommand = {
  COMMAND_STOP: 0,
  COMMAND_OPTIONAL_STOP: 1,
  COMMAND_END: 2,
  COMMAND_SPINDLE_CLOCKWISE: 3,
  COMMAND_SPINDLE_COUNTERCLOCKWISE: 4,
  COMMAND_STOP_SPINDLE: 5,
  COMMAND_ORIENTATE_SPINDLE: 19,
  COMMAND_LOAD_TOOL: 6,
  COMMAND_COOLANT_ON: 8,
  COMMAND_COOLANT_OFF: 9,
  COMMAND_LOCK_MULTI_AXIS: '',
  COMMAND_UNLOCK_MULTI_AXIS: ''
};

function onCommand(command) {
  switch (command) {
    case COMMAND_STOP:
      writeBlock(mFormat.format(0));
      forceSpindleSpeed = true;
      return;
    case COMMAND_START_SPINDLE:
      onCommand(tool.clockwise ? COMMAND_SPINDLE_CLOCKWISE : COMMAND_SPINDLE_COUNTERCLOCKWISE);
      return;
    case COMMAND_LOCK_MULTI_AXIS:
      return;
    case COMMAND_UNLOCK_MULTI_AXIS:
      return;
    case COMMAND_BREAK_CONTROL:
      return;
    case COMMAND_TOOL_MEASURE:
      return;
  }

  var mcode = mapCommand[getCommandStringId(command)];
  if (mcode != undefined) {
    if (mcode == '') {
      return; // ignore
    }
    writeBlock(mFormat.format(mcode));

    if (command == COMMAND_STOP_SPINDLE) {
      if (properties.dwellAfterStop > 0) {
        // make sure spindle reaches full spindle speed
        var seconds = clamp(0.001, properties.dwellAfterStop, 99999.999);
        writeBlock(gFormat.format(4), 'F' + secFormat.format(seconds));
      }
    }
  } else {
    onUnsupportedCommand(command);
  }
}

function onSectionEnd() {
  if (((getCurrentSectionId() + 1) >= getNumberOfSections()) ||
    (tool.number != getNextSection().getTool().number)) {
    if (isLastSection() && !isFirstSection()) {
      writeln('M63');
      if (tool.coolant == 8 || tool.coolant == 3) {
        writeComment('Air blow to clean tool from coolant');
        var cleanToolDiameter = getPreviousSection().getTool().diameter;
        var cleanToolDiameterSquared = cleanToolDiameter * cleanToolDiameter;
        var cleanToolTime = 100 * properties.cleanFactor / cleanToolDiameterSquared;
        writeBlock(mFormat.format(339));
        writeBlock(gFormat.format(4), pFormat.format(cleanToolTime));
        writeComment('End of cleaning');
      }
    } else if (isLastSection() && isFirstSection()) {
      writeln('M63');
      if (getSection(0).getTool().coolant == 8 || getSection(0).getTool().coolant == 3) {
        writeComment('Air blow to clean tool from coolant');
        var cleanToolDiameter = getSection(0).getTool().diameter;
        var cleanToolDiameterSquared = cleanToolDiameter * cleanToolDiameter;
        var cleanToolTime = 100 * properties.cleanFactor / cleanToolDiameterSquared;
        writeBlock(mFormat.format(339));
        writeBlock(gFormat.format(4), pFormat.format(cleanToolTime));
        writeComment('End of cleaning');
      }
    }
    onCommand(COMMAND_BREAK_CONTROL);
  }

  forceAny();
}

function onClose() {
  writeln('');

  onCommand(COMMAND_STOP_SPINDLE);
  onCommand(COMMAND_COOLANT_OFF);
  onCommand(COMMAND_UNLOCK_MULTI_AXIS);

  writeln('M06');

  // retract to safe plane
  if (properties.useG16) {
    writeBlock(gFormat.format(16), hFormat.format(0), gMotionModal.format(0), 'Z' + xyzFormat.format(machineConfiguration.getRetractPlane()));
  } else {
    // must move to highest position
    writeBlock(gMotionModal.format(0), 'Z' + xyzFormat.format(machineConfiguration.getRetractPlane()));
  }
  zOutput.reset();
  gAbsIncModal.reset();

  setWorkPlane(new Vector(0, 0, 0)); // reset working plane

  var homeX;
  if (machineConfiguration.hasHomePositionX()) {
    homeX = 'X' + xyzFormat.format(machineConfiguration.getHomePositionX());
  }
  var homeY;
  if (machineConfiguration.hasHomePositionY()) {
    homeY = 'Y' + xyzFormat.format(machineConfiguration.getHomePositionY());
  }

  if (properties.useG16) {
    if (homeX || homeY) {
      writeBlock(gFormat.format(16), hFormat.format(0), gMotionModal.format(0), homeX, homeY);
    } else {
      writeBlock(gFormat.format(16), hFormat.format(0), gMotionModal.format(0), 'X' + xyzFormat.format(0), 'Y' + xyzFormat.format(0)); // return to home
    }
  } else {
    // must move to outer limit - since coordinates are still in WCS
    if (homeX || homeY) {
      writeBlock(gMotionModal.format(0), homeX, homeY);
    }
  }
  forceXYZ();
  gAbsIncModal.reset();

  onCommand(COMMAND_END);
  writeln('%');
}
