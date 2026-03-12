    const STAGE_LIMITS = {
      leftStage1: 252,
      leftStage2: 168,
      rightStage1: 252,
      rightStage2: 168
    };
    const ASSISTANT_MAX_CHANNEL = 15;
    const ASSISTANT_TIME_MAX_MS = 2550;
    const ASSISTANT_BRIGHTNESS_MIN = 0;
    const ASSISTANT_BRIGHTNESS_MAX = 100;

    const inputs = {
      leftStage1: document.getElementById("left-stage-1"),
      leftStage2: document.getElementById("left-stage-2"),
      rightStage1: document.getElementById("right-stage-1"),
      rightStage2: document.getElementById("right-stage-2")
    };

    const normalizedOutputs = {
      leftStage1: document.getElementById("normalized-left-stage-1"),
      leftStage2: document.getElementById("normalized-left-stage-2"),
      rightStage1: document.getElementById("normalized-right-stage-1"),
      rightStage2: document.getElementById("normalized-right-stage-2")
    };

    const meterParts = {
      leftStage1: bindMeter("left-stage-1"),
      leftStage2: bindMeter("left-stage-2"),
      rightStage1: bindMeter("right-stage-1"),
      rightStage2: bindMeter("right-stage-2")
    };

    const validationFeedback = document.getElementById("validation-feedback");
    const validationFeedbackDetails = document.getElementById("validation-feedback-details");
    const timelineList = document.getElementById("timeline-list");
    const previewStage = document.getElementById("preview-stage");
    const timelineSlider = document.getElementById("timeline-slider");
    const timelineMeta = document.getElementById("timeline-meta");
    const playToggle = document.getElementById("play-toggle");
    const inputModeTabs = Array.from(document.querySelectorAll("[data-input-mode-target]"));
    const inputModes = Array.from(document.querySelectorAll("[data-input-mode]"));
    const assistantLeft = document.getElementById("assistant-left");
    const assistantRight = document.getElementById("assistant-right");
    const templateList = document.getElementById("template-list");
    const carModelSelect = document.getElementById("car-model-select");
    const payloadCard = document.getElementById("payload-card");
    const buildStack = document.getElementById("build-stack");
    const selectedModelCopy = document.getElementById("selected-model-copy");
    const currentPage = document.body.dataset.page || "build";
    const isBuildPage = currentPage === "build";
    const isTemplatesPage = currentPage === "templates";

    const appState = {
      channels: [],
      totalMs: 0,
      currentMs: 0,
      playing: false,
      animationFrame: 0,
      lastTick: 0,
      inputMode: "raw",
      selectedModel: "",
      assistant: {
        left: [],
        right: []
      },
      parsedSequences: {
        left: [],
        right: []
      },
      previewTimeline: null
    };

    let TEMPLATES = [];
    let timelineCharts = [];
    const TEMPLATE_MANIFEST_PATH = "templates/index.json";
    const TIMELINE_PLAYHEAD_PLUGIN = {
      id: "timelinePlayhead",
      afterDatasetsDraw(chart, args, options) {
        if (!options || typeof options.currentMs !== "number" || !chart.chartArea) {
          return;
        }

        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        if (!xScale) {
          return;
        }

        if (!yScale || options.currentMs < xScale.min || options.currentMs > xScale.max) {
          return;
        }

        const x = xScale.getPixelForValue(options.currentMs);
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, chart.chartArea.top - 4);
        ctx.lineTo(x, chart.chartArea.bottom + 4);
        ctx.lineWidth = 2;
        ctx.strokeStyle = options.color || "rgba(255,255,255,0.55)";
        ctx.stroke();

        chart.data.datasets.forEach((dataset) => {
          const yValue = getTimelineDatasetValueAtTime(dataset.data, options.currentMs);
          if (yValue === null) {
            return;
          }

          const y = yScale.getPixelForValue(yValue);
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = dataset.borderColor || options.color || "rgba(255,255,255,0.9)";
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(4, 11, 19, 0.95)";
          ctx.stroke();
        });
        ctx.restore();
      }
    };

    if (typeof window.Chart !== "undefined") {
      window.Chart.register(TIMELINE_PLAYHEAD_PLUGIN);
      if (typeof window.ChartZoom !== "undefined") {
        window.Chart.register(window.ChartZoom);
      }
    }


    function bindMeter(baseId) {
      return {
        count: document.getElementById(baseId + "-count"),
        capacity: document.getElementById(baseId + "-capacity"),
        fill: document.getElementById(baseId + "-meter")
      };
    }

    function splitHexBytes(rawValue) {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        return { bytes: [], issues: [] };
      }

      const compact = trimmed.replace(/0x/gi, "").trim();
      const hasSeparator = /[^0-9a-fA-F]/.test(compact);
      const tokens = [];

      if (hasSeparator) {
        for (const token of compact.split(/[^0-9a-fA-F]+/).filter(Boolean)) {
          tokens.push(token);
        }
      } else {
        const hexOnly = compact.replace(/[^0-9a-fA-F]/g, "");
        if (hexOnly.length % 2 !== 0) {
          return { bytes: [], issues: ["Hex input has an odd number of characters."] };
        }
        for (let index = 0; index < hexOnly.length; index += 2) {
          tokens.push(hexOnly.slice(index, index + 2));
        }
      }

      const issues = [];
      const bytes = [];

      tokens.forEach((token, tokenIndex) => {
        if (token.length > 2) {
          issues.push("Byte token #" + (tokenIndex + 1) + " is longer than 2 hex digits.");
          return;
        }
        if (!/^[0-9a-fA-F]{1,2}$/.test(token)) {
          issues.push("Byte token #" + (tokenIndex + 1) + " is not valid hex.");
          return;
        }
        bytes.push(parseInt(token.padStart(2, "0"), 16));
      });

      return { bytes, issues };
    }

    function formatBytes(bytes) {
      return bytes.map((value) => value.toString(16).toUpperCase().padStart(2, "0")).join(", ");
    }

    function getPaddedStageBytes(bytes, limit) {
      const paddedBytes = bytes.slice(0, limit);
      while (paddedBytes.length < limit) {
        paddedBytes.push(0x00);
      }
      return paddedBytes;
    }

    function formatPaddedStageBytes(bytes, limit) {
      const paddedBytes = getPaddedStageBytes(bytes, limit);
      return formatBytes(paddedBytes);
    }

    function msToDurationByte(durationMs) {
      return clamp(Math.round(Number(durationMs || 0) / 10), 0, 255);
    }

    function percentToBrightnessByte(percent) {
      return clamp(Math.round(Number(percent || 0)), ASSISTANT_BRIGHTNESS_MIN, ASSISTANT_BRIGHTNESS_MAX);
    }

    function clampAssistantNumericValue(field, rawValue) {
      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        return 0;
      }

      if (field === "brightness") {
        return clamp(Math.round(numericValue), ASSISTANT_BRIGHTNESS_MIN, ASSISTANT_BRIGHTNESS_MAX);
      }

      if (field === "rampMs" || field === "holdMs") {
        return clamp(Math.round(numericValue), 0, ASSISTANT_TIME_MAX_MS);
      }

      return numericValue;
    }

    function parsePayload(bytes, label) {
      const sequences = [];
      const issues = [];
      let offset = 0;
      let foundTerminator = false;

      while (offset < bytes.length) {
        if (offset + 2 < bytes.length && bytes[offset] === 0 && bytes[offset + 1] === 0 && bytes[offset + 2] === 0) {
          foundTerminator = true;
          break;
        }

        if (offset + 2 >= bytes.length) {
          issues.push(label + " ends before a channel header can be completed at byte " + offset + ".");
          break;
        }

        const channel = bytes[offset];
        const pairCount = (bytes[offset + 1] << 8) | bytes[offset + 2];
        const sequenceOffset = offset;
        offset += 3;

        if (channel === 0) {
          issues.push(label + " uses channel 0x00 at byte " + sequenceOffset + ". 00 00 00 is reserved as the terminator.");
          continue;
        }

        if (pairCount === 0) {
          issues.push(label + " channel 0x" + toHex(channel) + " has a zero length at byte " + sequenceOffset + ".");
          continue;
        }

        const neededBytes = pairCount * 2;
        if (offset + neededBytes > bytes.length) {
          issues.push(label + " channel 0x" + toHex(channel) + " declares " + pairCount + " pairs but the payload ends early.");
          break;
        }

        const steps = [];
        for (let index = 0; index < pairCount; index += 1) {
          const durationByte = bytes[offset + (index * 2)];
          const brightnessByte = bytes[offset + (index * 2) + 1];
          if (brightnessByte > 100) {
            issues.push(label + " channel 0x" + toHex(channel) + " contains brightness " + brightnessByte + "% at pair " + (index + 1) + ", above the documented 0-100 range.");
          }
          steps.push({
            durationByte,
            brightnessByte,
            durationMs: durationByte * 10,
            brightness: brightnessByte
          });
        }

        sequences.push({
          channel,
          pairCount,
          offset: sequenceOffset,
          steps,
          totalMs: steps.reduce((sum, step) => sum + step.durationMs, 0)
        });

        offset += neededBytes;
      }

      if (bytes.length && !foundTerminator) {
        issues.push(label + " does not contain the expected 00 00 00 terminator.");
      }

      return { sequences, issues };
    }

    function buildChannelMap(parsedLeft, parsedRight) {
      const ids = new Set();
      parsedLeft.sequences.forEach((sequence) => ids.add(sequence.channel));
      parsedRight.sequences.forEach((sequence) => ids.add(sequence.channel));

      return Array.from(ids)
        .sort((left, right) => left - right)
        .map((channel) => {
          const leftSequence = parsedLeft.sequences.find((sequence) => sequence.channel === channel) || null;
          const rightSequence = parsedRight.sequences.find((sequence) => sequence.channel === channel) || null;

          return {
            channel,
            leftSequence,
            rightSequence,
            sameCurve: leftSequence && rightSequence &&
              JSON.stringify(leftSequence.steps) === JSON.stringify(rightSequence.steps),
            totalMs: Math.max(leftSequence ? leftSequence.totalMs : 0, rightSequence ? rightSequence.totalMs : 0)
          };
        });
    }

    function assistantChannelFromSequence(sequence) {
      const steps = [];

      for (let index = 0; index < sequence.steps.length; index += 1) {
        const currentStep = sequence.steps[index];
        const nextStep = sequence.steps[index + 1];
        let holdMs = 0;

        if (nextStep && nextStep.brightness === currentStep.brightness) {
          holdMs = nextStep.durationMs;
          index += 1;
        }

        steps.push({
          brightness: currentStep.brightness,
          rampMs: currentStep.durationMs,
          holdMs
        });
      }

      return {
        id: toHex(sequence.channel),
        steps
      };
    }

    function importAssistantFromRaw() {
      const leftPayload = [
        ...splitHexBytes(inputs.leftStage1.value).bytes,
        ...splitHexBytes(inputs.leftStage2.value).bytes
      ];
      const rightPayload = [
        ...splitHexBytes(inputs.rightStage1.value).bytes,
        ...splitHexBytes(inputs.rightStage2.value).bytes
      ];

      const parsedLeft = parsePayload(leftPayload, "Left payload");
      const parsedRight = parsePayload(rightPayload, "Right payload");

      appState.assistant.left = parsedLeft.sequences.map(assistantChannelFromSequence);
      appState.assistant.right = parsedRight.sequences.map(assistantChannelFromSequence);
      renderAssistant();
    }

    function buildBytesFromAssistantSide(side) {
      const bytes = [];
      appState.assistant[side].forEach((channel) => {
        const channelId = parseInt(String(channel.id || "0").replace(/^0x/i, ""), 16);
        const pairs = [];

        channel.steps.forEach((step) => {
          if (step.rampMs === "" || step.brightness === "") {
            return;
          }

          pairs.push({
            durationByte: msToDurationByte(step.rampMs),
            brightnessByte: percentToBrightnessByte(step.brightness)
          });

          if (Number(step.holdMs) > 0) {
            pairs.push({
              durationByte: msToDurationByte(step.holdMs),
              brightnessByte: percentToBrightnessByte(step.brightness)
            });
          }
        });

        bytes.push(clamp(Number.isFinite(channelId) ? channelId : 0, 0, 255));
        bytes.push((pairs.length >> 8) & 0xFF, pairs.length & 0xFF);
        pairs.forEach((pair) => {
          bytes.push(pair.durationByte, pair.brightnessByte);
        });
      });
      bytes.push(0x00, 0x00, 0x00);
      return bytes;
    }

    function syncRawFromAssistant() {
      const leftBytes = buildBytesFromAssistantSide("left");
      const rightBytes = buildBytesFromAssistantSide("right");

      const splitIntoStages = (bytes) => ({
        stage1: bytes.slice(0, STAGE_LIMITS.leftStage1),
        stage2: bytes.slice(STAGE_LIMITS.leftStage1, STAGE_LIMITS.leftStage1 + STAGE_LIMITS.leftStage2)
      });

      const leftStages = splitIntoStages(leftBytes);
      const rightStages = splitIntoStages(rightBytes);

      inputs.leftStage1.value = formatBytes(leftStages.stage1);
      inputs.leftStage2.value = formatBytes(leftStages.stage2);
      inputs.rightStage1.value = formatBytes(rightStages.stage1);
      inputs.rightStage2.value = formatBytes(rightStages.stage2);
      updateAllMeters();
    }

    function setInputMode(mode) {
      appState.inputMode = mode;
      inputModeTabs.forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.inputModeTarget === mode);
      });
      inputModes.forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.inputMode === mode);
      });
    }

    function addAssistantChannel(side) {
      resetValidationState();
      appState.assistant[side].push({
        id: side === "left" ? "01" : "01",
        steps: [{ rampMs: 50, brightness: 0, holdMs: 0 }]
      });
      renderAssistant();
      syncRawFromAssistant();
    }

    function cloneAssistantChannels(side) {
      return appState.assistant[side].map((channel) => ({
        id: channel.id,
        steps: channel.steps.map((step) => ({
          rampMs: step.rampMs,
          brightness: step.brightness,
          holdMs: step.holdMs
        }))
      }));
    }

    function syncAssistantSide(fromSide, toSide) {
      resetValidationState();
      appState.assistant[toSide] = cloneAssistantChannels(fromSide);
      renderAssistant();
      syncRawFromAssistant();
    }

    function renderAssistantSide(side, container) {
      const channels = appState.assistant[side];
      const config = getSelectedVehicleConfig();
      if (!channels.length) {
        container.innerHTML = '<div class="assistant-empty">No channels yet. Add one or import from raw payload data.</div>';
        return;
      }

      const trashIcon = `
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18"></path>
          <path d="M8 6V4h8v2"></path>
          <path d="M19 6l-1 14H6L5 6"></path>
          <path d="M10 11v6"></path>
          <path d="M14 11v6"></path>
        </svg>
      `;

      container.innerHTML = channels.map((channel, channelIndex) => {
        const channelOptions = getAssistantChannelOptions(config);
        const normalizedChannelId = normalizeChannelIdValue(channel.id);
        const selectedChannelValue = normalizedChannelId !== null && normalizedChannelId >= 1 && normalizedChannelId <= ASSISTANT_MAX_CHANNEL
          ? toHex(normalizedChannelId)
          : "01";

        return `
        <div class="channel-card">
          <div class="channel-head">
            <div class="mini-field">
              <label>Channel</label>
              <select data-assistant-side="${side}" data-channel-index="${channelIndex}" data-field="id">
                ${channelOptions.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === selectedChannelValue ? " selected" : ""}>${escapeHtml(option.text)}</option>`).join("")}
              </select>
            </div>
            <div class="channel-meta">Rows: ${channel.steps.length} · Pairs: ${channel.steps.reduce((sum, step) => sum + 1 + (Number(step.holdMs || 0) > 0 ? 1 : 0), 0)}<br>Total: ${formatMs(channel.steps.reduce((sum, step) => sum + Number(step.rampMs || 0) + Number(step.holdMs || 0), 0))}</div>
            <button class="icon-button danger" type="button" aria-label="Remove channel" title="Remove channel" data-remove-channel="${side}:${channelIndex}">${trashIcon}</button>
          </div>
          <div class="step-list">
            ${channel.steps.map((step, stepIndex) => `
              <div class="step-row">
                <div class="mini-field">
                  <label>Ramp (ms)</label>
                  <input type="number" min="0" max="${ASSISTANT_TIME_MAX_MS}" step="10" data-assistant-side="${side}" data-channel-index="${channelIndex}" data-step-index="${stepIndex}" data-field="rampMs" value="${escapeHtml(String(step.rampMs))}">
                </div>
                <div class="mini-field">
                  <label>Brightness (%)</label>
                  <input type="number" min="${ASSISTANT_BRIGHTNESS_MIN}" max="${ASSISTANT_BRIGHTNESS_MAX}" step="1" data-assistant-side="${side}" data-channel-index="${channelIndex}" data-step-index="${stepIndex}" data-field="brightness" value="${escapeHtml(String(step.brightness))}">
                </div>
                <div class="mini-field">
                  <label>Hold (ms)</label>
                  <input type="number" min="0" max="${ASSISTANT_TIME_MAX_MS}" step="10" data-assistant-side="${side}" data-channel-index="${channelIndex}" data-step-index="${stepIndex}" data-field="holdMs" value="${escapeHtml(String(step.holdMs))}">
                </div>
                <button class="icon-button danger" type="button" aria-label="Remove row" title="Remove row" data-remove-step="${side}:${channelIndex}:${stepIndex}">${trashIcon}</button>
              </div>
            `).join("")}
          </div>
          <div class="actions">
            <button class="secondary" type="button" data-add-step="${side}:${channelIndex}">Add Step</button>
          </div>
        </div>
      `;
      }).join("");
    }

    function renderAssistant() {
      const activeAssistantInput = document.activeElement && document.activeElement.matches("[data-assistant-side]")
        ? {
            side: document.activeElement.dataset.assistantSide,
            channelIndex: document.activeElement.dataset.channelIndex,
            stepIndex: document.activeElement.dataset.stepIndex,
            field: document.activeElement.dataset.field,
            selectionStart: typeof document.activeElement.selectionStart === "number" ? document.activeElement.selectionStart : null,
            selectionEnd: typeof document.activeElement.selectionEnd === "number" ? document.activeElement.selectionEnd : null
          }
        : null;

      renderAssistantSide("left", assistantLeft);
      renderAssistantSide("right", assistantRight);

      document.querySelectorAll("[data-add-step]").forEach((button) => {
        button.addEventListener("click", () => {
          resetValidationState();
          const [side, channelIndex] = button.dataset.addStep.split(":");
          appState.assistant[side][Number(channelIndex)].steps.push({ rampMs: 50, brightness: 0, holdMs: 0 });
          renderAssistant();
          syncRawFromAssistant();
        });
      });

      document.querySelectorAll("[data-remove-step]").forEach((button) => {
        button.addEventListener("click", () => {
          resetValidationState();
          const [side, channelIndex, stepIndex] = button.dataset.removeStep.split(":");
          appState.assistant[side][Number(channelIndex)].steps.splice(Number(stepIndex), 1);
          if (!appState.assistant[side][Number(channelIndex)].steps.length) {
            appState.assistant[side][Number(channelIndex)].steps.push({ rampMs: 50, brightness: 0, holdMs: 0 });
          }
          renderAssistant();
          syncRawFromAssistant();
        });
      });

      document.querySelectorAll("[data-remove-channel]").forEach((button) => {
        button.addEventListener("click", () => {
          resetValidationState();
          const [side, channelIndex] = button.dataset.removeChannel.split(":");
          appState.assistant[side].splice(Number(channelIndex), 1);
          renderAssistant();
          syncRawFromAssistant();
        });
      });

      document.querySelectorAll("[data-assistant-side]").forEach((input) => {
        input.addEventListener("input", () => {
          resetValidationState();
          const side = input.dataset.assistantSide;
          const channelIndex = Number(input.dataset.channelIndex);
          const field = input.dataset.field;
          const stepIndex = input.dataset.stepIndex;

          if (stepIndex === undefined) {
            appState.assistant[side][channelIndex][field] = input.value.toUpperCase();
          } else {
            const clampedValue = clampAssistantNumericValue(field, input.value);
            input.value = String(clampedValue);
            appState.assistant[side][channelIndex].steps[Number(stepIndex)][field] = clampedValue;
          }
          syncRawFromAssistant();
          if (stepIndex === undefined && field === "id") {
            renderAssistant();
          }
        });
      });

      if (activeAssistantInput) {
        const selector = [
          `[data-assistant-side="${activeAssistantInput.side}"]`,
          `[data-channel-index="${activeAssistantInput.channelIndex}"]`,
          `[data-field="${activeAssistantInput.field}"]`,
          activeAssistantInput.stepIndex !== undefined
            ? `[data-step-index="${activeAssistantInput.stepIndex}"]`
            : ":not([data-step-index])"
        ].join("");
        const restoredInput = document.querySelector(selector);
        if (restoredInput) {
          restoredInput.focus();
          try {
            const end = restoredInput.value.length;
            restoredInput.setSelectionRange(end, end);
          } catch (error) {
            // Ignore inputs that don't support selection ranges.
          }
        }
      }
    }

    function brightnessAt(sequence, timeMs, initialBrightness) {
      if (!sequence || !sequence.steps.length) {
        return 0;
      }

      let currentBrightness = Number(initialBrightness) || 0;
      let cursor = 0;

      for (const step of sequence.steps) {
        const end = cursor + step.durationMs;
        if (timeMs <= end) {
          if (step.durationMs === 0) {
            return step.brightness;
          }
          const progress = clamp((timeMs - cursor) / step.durationMs, 0, 1);
          return currentBrightness + ((step.brightness - currentBrightness) * progress);
        }
        cursor = end;
        currentBrightness = step.brightness;
      }

      return currentBrightness;
    }

    function getVehicleConfig(modelId) {
      const configs = typeof VEHICLE_CONFIGS === "object" && VEHICLE_CONFIGS ? VEHICLE_CONFIGS : {};
      return configs[modelId] || configs.generic || { name: "Generic", type: "grid" };
    }

    function getSelectedVehicleConfig() {
      return getVehicleConfig(appState.selectedModel);
    }

    function normalizeChannelIdValue(channelId) {
      const normalized = String(channelId || "").trim().replace(/^0x/i, "");
      if (!normalized || !/^[0-9a-fA-F]{1,2}$/.test(normalized)) {
        return null;
      }
      return parseInt(normalized, 16);
    }

    function getAssistantChannelOptions(config) {
      const resolvedConfig = config || getSelectedVehicleConfig();
      const labelsById = new Map();

      if (resolvedConfig && Array.isArray(resolvedConfig.channels)) {
        resolvedConfig.channels.forEach((channel) => {
          if (typeof channel.id === "number" && channel.label) {
            labelsById.set(channel.id, channel.label);
          }
        });
      }

      return Array.from({ length: ASSISTANT_MAX_CHANNEL }, (_, index) => {
        const channelId = index + 1;
        const label = labelsById.get(channelId);
        return {
          value: toHex(channelId),
          text: label ? "Ch " + channelId + " - " + label : "Ch " + channelId
        };
      });
    }

    function getVehicleChannelLabel(channelId, config) {
      const resolvedConfig = config || getSelectedVehicleConfig();
      const numericChannelId = typeof channelId === "number" ? channelId : normalizeChannelIdValue(channelId);
      if (!resolvedConfig || !Array.isArray(resolvedConfig.channels) || numericChannelId === null) {
        return "";
      }

      const channel = resolvedConfig.channels.find((entry) => entry.id === numericChannelId);
      return channel && channel.label ? channel.label : "";
    }

    function computePreviewTimeline(config) {
      if (!config || !Array.isArray(config.phases)) {
        return null;
      }

      const computedPhases = [];
      const channelPhaseMap = {};
      let previousEnd = 0;

      config.phases.forEach((phase, phaseIndex) => {
        phase.channels.forEach((channelId) => {
          channelPhaseMap[channelId] = phaseIndex;
        });

        let maxChannelDuration = 0;
        phase.channels.forEach((channelId) => {
          ["left", "right"].forEach((side) => {
            const sequence = getSequenceForSide(side, channelId);
            if (sequence) {
              maxChannelDuration = Math.max(maxChannelDuration, sequence.totalMs);
            }
          });
        });

        if (phase.maxDuration !== null && phase.maxDuration !== undefined) {
          maxChannelDuration = Math.min(maxChannelDuration, phase.maxDuration);
        }

        const start = phase.anchor !== null && phase.anchor !== undefined
          ? Math.max(previousEnd, phase.anchor)
          : previousEnd;
        const end = start + maxChannelDuration;

        computedPhases.push({
          name: phase.name,
          channels: phase.channels,
          start,
          end,
          maxDuration: phase.maxDuration !== undefined ? phase.maxDuration : null
        });

        previousEnd = end;
      });

      return {
        phases: computedPhases,
        channelPhaseMap,
        totalDuration: previousEnd
      };
    }

    function getSequenceForSide(side, channelId) {
      return appState.parsedSequences[side].find((sequence) => sequence.channel === channelId) || null;
    }

    function getControllingChannelsSorted(physicalChannelId, config) {
      const channels = [physicalChannelId];
      (config.channels || []).forEach((channel) => {
        if (channel.physicalLight === physicalChannelId) {
          channels.push(channel.id);
        }
      });

      return channels.sort((left, right) => {
        const leftPhase = appState.previewTimeline && appState.previewTimeline.channelPhaseMap[left] !== undefined
          ? appState.previewTimeline.channelPhaseMap[left]
          : -1;
        const rightPhase = appState.previewTimeline && appState.previewTimeline.channelPhaseMap[right] !== undefined
          ? appState.previewTimeline.channelPhaseMap[right]
          : -1;
        return leftPhase - rightPhase;
      });
    }

    function resolvePhysicalLightPhase(physicalChannelId, timeMs, side, config) {
      if (!appState.previewTimeline) {
        return null;
      }

      const defaults = config.defaultStates || {};
      const controllingChannels = getControllingChannelsSorted(physicalChannelId, config);

      for (let index = 0; index < controllingChannels.length; index += 1) {
        const channelId = controllingChannels[index];
        const phaseIndex = appState.previewTimeline.channelPhaseMap[channelId];
        if (phaseIndex === undefined) {
          continue;
        }

        const phase = appState.previewTimeline.phases[phaseIndex];
        const sequence = getSequenceForSide(side, channelId);
        const sequenceDuration = sequence ? sequence.totalMs : 0;
        const effectiveEnd = phase.maxDuration !== null
          ? Math.min(phase.start + sequenceDuration, phase.start + phase.maxDuration)
          : phase.start + sequenceDuration;

        if (timeMs >= phase.start && timeMs < effectiveEnd) {
          return {
            state: "active",
            channelIndex: index,
            localTime: timeMs - phase.start,
            phase,
            sequence
          };
        }

        const nextChannelId = controllingChannels[index + 1];
        const nextPhaseIndex = nextChannelId === undefined ? undefined : appState.previewTimeline.channelPhaseMap[nextChannelId];
        if (nextPhaseIndex === undefined) {
          continue;
        }

        const nextPhase = appState.previewTimeline.phases[nextPhaseIndex];
        if (timeMs >= effectiveEnd && timeMs < nextPhase.start) {
          const defaultState = defaults[physicalChannelId] || { brightness: 0, rampUp: 0, rampDown: 0 };
          const gapStart = effectiveEnd;
          const gapEnd = nextPhase.start;

          if (defaultState.rampUp > 0 && timeMs < gapStart + defaultState.rampUp) {
            const lastBrightness = sequence ? brightnessAt(sequence, sequenceDuration) : 0;
            return {
              state: "rampUp",
              gapStart,
              lastBrightness,
              defaultBrightness: defaultState.brightness || 0,
              rampUp: defaultState.rampUp
            };
          }

          if (defaultState.rampDown > 0 && timeMs > gapEnd - defaultState.rampDown) {
            return {
              state: "rampDown",
              defaultBrightness: defaultState.brightness || 0
            };
          }

          return {
            state: "default",
            defaultBrightness: defaultState.brightness || 0
          };
        }
      }

      return { state: "off" };
    }

    function getPhaseAwareBrightness(physicalChannelId, timeMs, side, config) {
      const resolved = resolvePhysicalLightPhase(physicalChannelId, timeMs, side, config);
      if (!resolved) {
        return 0;
      }

      switch (resolved.state) {
        case "active": {
          const initialBrightness = resolved.channelIndex > 0
            ? ((config.defaultStates || {})[physicalChannelId] || {}).brightness || 0
            : 0;
          return resolved.sequence ? brightnessAt(resolved.sequence, resolved.localTime, initialBrightness) : 0;
        }
        case "rampUp": {
          const progress = clamp((timeMs - resolved.gapStart) / resolved.rampUp, 0, 1);
          return resolved.lastBrightness + ((resolved.defaultBrightness - resolved.lastBrightness) * progress);
        }
        case "rampDown":
        case "default":
          return resolved.defaultBrightness;
        case "off":
        default:
          return 0;
      }
    }

    function getPreviewBrightness(side, channelId, config) {
      if (appState.previewTimeline && config.type === "image") {
        return getPhaseAwareBrightness(channelId, appState.currentMs, side, config);
      }

      const sequence = getSequenceForSide(side, channelId);
      return brightnessAt(sequence, appState.currentMs);
    }

    function parseHexColor(colorValue) {
      const hex = String(colorValue || "").replace("#", "");
      if (hex.length !== 6 && hex.length !== 8) {
        return { r: 255, g: 255, b: 255, a: 1 };
      }

      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
      };
    }

    function createPreviewSvgShape(shapeConfig) {
      const namespace = "http://www.w3.org/2000/svg";
      let shape = null;

      if (shapeConfig.type === "path") {
        shape = document.createElementNS(namespace, "path");
        shape.setAttribute("d", shapeConfig.d);
      } else if (shapeConfig.type === "circle") {
        shape = document.createElementNS(namespace, "circle");
        shape.setAttribute("cx", shapeConfig.cx);
        shape.setAttribute("cy", shapeConfig.cy);
        shape.setAttribute("r", shapeConfig.r);
      } else if (shapeConfig.type === "polygon") {
        shape = document.createElementNS(namespace, "polygon");
        shape.setAttribute("points", shapeConfig.points);
      } else if (shapeConfig.type === "rect") {
        shape = document.createElementNS(namespace, "rect");
        shape.setAttribute("x", shapeConfig.x);
        shape.setAttribute("y", shapeConfig.y);
        shape.setAttribute("width", shapeConfig.width);
        shape.setAttribute("height", shapeConfig.height);
        if (shapeConfig.rx) {
          shape.setAttribute("rx", shapeConfig.rx);
        }
        if (shapeConfig.ry) {
          shape.setAttribute("ry", shapeConfig.ry);
        }
      }

      if (shape && shapeConfig.color) {
        shape.dataset.color = shapeConfig.color;
      }

      return shape;
    }

    function createVehicleSvg(side, config) {
      const namespace = "http://www.w3.org/2000/svg";
      const viewBoxParts = String(config.viewBox || "0 0 720 304").split(/\s+/);
      const viewBoxWidth = Number(viewBoxParts[2]) || 720;
      const viewBoxHeight = Number(viewBoxParts[3]) || 304;
      const isMirroredSide = (config.baseSide || "left") !== side;
      const svg = document.createElementNS(namespace, "svg");
      svg.setAttribute("class", "vehicle-svg");
      svg.setAttribute("viewBox", config.viewBox);
      svg.setAttribute("aria-label", config.name + " " + side + " preview");

      const contentGroup = document.createElementNS(namespace, "g");
      if (isMirroredSide) {
        contentGroup.setAttribute("transform", "translate(" + viewBoxWidth + " 0) scale(-1 1)");
      }

      const image = document.createElementNS(namespace, "image");
      image.setAttribute("href", config.image);
      image.setAttribute("width", String(viewBoxWidth));
      image.setAttribute("height", String(viewBoxHeight));
      image.setAttribute("preserveAspectRatio", "xMidYMid meet");
      contentGroup.appendChild(image);

      const overlay = document.createElementNS(namespace, "g");

      (config.channels || []).forEach((channel) => {
        if (channel.physicalLight) {
          return;
        }

        const group = document.createElementNS(namespace, "g");
        group.setAttribute("id", side + "-light-ch-" + channel.id);
        group.setAttribute("class", "vehicle-light");
        group.dataset.channel = String(channel.id);

        if (Array.isArray(channel.shapes)) {
          channel.shapes.forEach((shapeConfig) => {
            const shape = createPreviewSvgShape(shapeConfig);
            if (shape) {
              group.appendChild(shape);
            }
          });
        } else if (channel.type) {
          const shape = createPreviewSvgShape(channel);
          if (shape) {
            group.appendChild(shape);
          }
        }

        const title = document.createElementNS(namespace, "title");
        title.textContent = channel.label || ("Channel " + channel.id);
        group.appendChild(title);
        overlay.appendChild(group);
      });

      contentGroup.appendChild(overlay);
      svg.appendChild(contentGroup);
      return svg;
    }

    function applyPreviewBrightness(element, brightness, side) {
      if (!element) {
        return;
      }

      if (element instanceof SVGElement) {
        const shapes = element.tagName.toLowerCase() === "g"
          ? Array.from(element.children).filter((child) => child.tagName.toLowerCase() !== "title")
          : [element];
        const glowColor = "255, 255, 255";

        if (brightness <= 0) {
          shapes.forEach((shape) => {
            shape.setAttribute("fill", "transparent");
            shape.setAttribute("stroke", "transparent");
          });
          element.style.opacity = "0";
          element.style.filter = "none";
          return;
        }

        element.style.opacity = "1";
        shapes.forEach((shape) => {
          const baseColor = shape.dataset.color ? parseHexColor(shape.dataset.color) : { r: 255, g: 255, b: 255, a: 1 };
          const alpha = clamp((brightness / 100) * baseColor.a, 0, 1);
          const color = "rgba(" + baseColor.r + ", " + baseColor.g + ", " + baseColor.b + ", " + alpha.toFixed(3) + ")";
          shape.setAttribute("fill", color);
          shape.setAttribute("stroke", color);
          shape.setAttribute("stroke-width", "2");
          shape.setAttribute("stroke-linejoin", "round");
        });

        element.style.filter = "drop-shadow(0 0 " + Math.max(6, brightness / 3).toFixed(1) + "px rgba(" + glowColor + ", " + Math.min(0.85, brightness / 100).toFixed(3) + "))";
        return;
      }

      element.style.setProperty("--beam-opacity", (0.08 + (brightness / 100) * 0.92).toFixed(3));
    }

    function formatTimelineAxisLabel(valueMs) {
      if (valueMs >= 1000) {
        const seconds = valueMs / 1000;
        return (Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1)) + "s";
      }
      return Math.round(valueMs) + "ms";
    }

    function buildTimelineXTicks(rangeStart, rangeEnd) {
      if (rangeEnd <= rangeStart) {
        return [0];
      }

      const ticks = [];
      const firstWholeSecond = Math.ceil(rangeStart / 1000) * 1000;

      ticks.push(rangeStart);
      for (let tick = firstWholeSecond; tick <= rangeEnd; tick += 1000) {
        ticks.push(tick);
      }

      if (ticks[ticks.length - 1] !== rangeEnd) {
        ticks.push(rangeEnd);
      }

      return Array.from(new Set(ticks));
    }

    function shouldHidePenultimateTimelineTick(ticks, index, maxTime, scaleWidth) {
      if (ticks.length < 2 || maxTime <= 0) {
        return false;
      }

      if (index !== ticks.length - 2) {
        return false;
      }

      const lastTick = ticks[ticks.length - 1].value;
      const previousTick = ticks[ticks.length - 2].value;
      const pixelGap = ((lastTick - previousTick) / maxTime) * scaleWidth;

      return pixelGap < 28;
    }

    function buildTimelineChartPoints(sequence, maxTime) {
      if (!sequence) {
        return [];
      }

      const points = [{ x: 0, y: 0 }];
      let time = 0;
      let brightness = 0;

      sequence.steps.forEach((step) => {
        const nextTime = time + step.durationMs;
        if (step.durationMs > 0) {
          points.push({ x: time, y: brightness });
        }
        points.push({ x: nextTime, y: step.brightness });
        time = nextTime;
        brightness = step.brightness;
      });

      if (time < maxTime) {
        points.push({ x: maxTime, y: brightness });
      }

      return points;
    }

    function getTimelineDatasetValueAtTime(points, timeMs) {
      if (!Array.isArray(points) || !points.length) {
        return null;
      }

      if (timeMs <= points[0].x) {
        return points[0].y;
      }

      for (let index = 1; index < points.length; index += 1) {
        const previousPoint = points[index - 1];
        const currentPoint = points[index];

        if (timeMs <= currentPoint.x) {
          if (currentPoint.x === previousPoint.x) {
            return currentPoint.y;
          }

          const progress = clamp((timeMs - previousPoint.x) / (currentPoint.x - previousPoint.x), 0, 1);
          return previousPoint.y + ((currentPoint.y - previousPoint.y) * progress);
        }
      }

      return points[points.length - 1].y;
    }

    function zoomTimelineChartX(chart, totalMaxTime, deltaY, anchorPixelX) {
      const xScale = chart.scales.x;
      if (!xScale) {
        return;
      }

      const currentMin = Number.isFinite(xScale.min) ? xScale.min : 0;
      const currentMax = Number.isFinite(xScale.max) ? xScale.max : totalMaxTime;
      const currentRange = Math.max(currentMax - currentMin, 1);
      const minRange = Math.min(250, totalMaxTime);
      const zoomFactor = deltaY < 0 ? 0.85 : 1 / 0.85;
      let nextRange = clamp(currentRange * zoomFactor, minRange, totalMaxTime);

      if (nextRange >= totalMaxTime) {
        chart.options.scales.x.min = 0;
        chart.options.scales.x.max = totalMaxTime;
        chart.update("none");
        return;
      }

      const chartArea = chart.chartArea;
      const clampedPixelX = clamp(anchorPixelX, chartArea.left, chartArea.right);
      const anchorValue = xScale.getValueForPixel(clampedPixelX);
      const anchorRatio = clamp((anchorValue - currentMin) / currentRange, 0, 1);

      let nextMin = anchorValue - (nextRange * anchorRatio);
      let nextMax = nextMin + nextRange;

      if (nextMin < 0) {
        nextMin = 0;
        nextMax = nextRange;
      }
      if (nextMax > totalMaxTime) {
        nextMax = totalMaxTime;
        nextMin = totalMaxTime - nextRange;
      }

      chart.options.scales.x.min = nextMin;
      chart.options.scales.x.max = nextMax;
      chart.update("none");
    }

    function getCssVarColor(name, fallback) {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    }

    function destroyTimelineCharts() {
      timelineCharts.forEach((chart) => {
        if (chart && chart.canvas && chart.$wheelZoomHandler) {
          chart.canvas.removeEventListener("wheel", chart.$wheelZoomHandler);
        }
        if (chart && typeof chart.destroy === "function") {
          chart.destroy();
        }
      });
      timelineCharts = [];
    }

    function renderTimelineCharts() {
      destroyTimelineCharts();

      if (typeof window.Chart === "undefined") {
        timelineList.innerHTML = '<div class="empty-state">Chart.js failed to load, so timelines are unavailable.</div>';
        return;
      }

      const maxTime = Math.max(appState.totalMs, 1);
      const leftColor = getCssVarColor("--left", "#54b8ff");
      const rightColor = getCssVarColor("--right", "#ff7262");
      const sharedColor = getCssVarColor("--shared", "#6cf1b2");
      const gridColor = "rgba(255,255,255,0.08)";
      const axisColor = "rgba(255,255,255,0.22)";
      const labelColor = "rgba(255,255,255,0.7)";
      const playheadColor = "rgba(255,255,255,0.55)";

      Array.from(timelineList.querySelectorAll(".timeline-chart")).forEach((canvas, index) => {
        const channelEntry = appState.channels[index];

        const chart = new window.Chart(canvas.getContext("2d"), {
          type: "line",
          data: {
            datasets: [
              {
                data: buildTimelineChartPoints(channelEntry.leftSequence, maxTime),
                borderColor: channelEntry.sameCurve ? sharedColor : leftColor,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 0,
                fill: false
              },
              {
                data: buildTimelineChartPoints(channelEntry.rightSequence, maxTime),
                borderColor: channelEntry.sameCurve ? sharedColor : rightColor,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 0,
                fill: false
              }
            ]
          },
          options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            normalized: true,
            parsing: false,
            layout: {
              padding: {
                top: 16,
                right: 14,
                bottom: 8,
                left: 8
              }
            },
            plugins: {
              legend: {
                display: false
              },
              tooltip: {
                enabled: false
              },
              timelinePlayhead: {
                currentMs: appState.currentMs,
                color: playheadColor
              },
              zoom: {
                limits: {
                  x: { min: 0, max: maxTime, minRange: Math.min(250, maxTime) },
                  y: { min: 0, max: 100 }
                },
                pan: {
                  enabled: true,
                  mode: "x"
                },
                zoom: {
                  wheel: {
                    enabled: false
                  },
                  pinch: {
                    enabled: true
                  },
                  mode: "x"
                }
              }
            },
            elements: {
              line: {
                tension: 0
              }
            },
            scales: {
              x: {
                type: "linear",
                min: 0,
                max: maxTime,
                afterBuildTicks(scale) {
                  scale.ticks = buildTimelineXTicks(scale.min, scale.max).map((value) => ({ value }));
                },
                grid: {
                  color(context) {
                    return shouldHidePenultimateTimelineTick(
                      context.scale.ticks,
                      context.index,
                      Math.max(context.scale.max - context.scale.min, 1),
                      context.scale.width
                    )
                      ? "rgba(255,255,255,0)"
                      : gridColor;
                  }
                },
                border: {
                  color: axisColor
                },
                ticks: {
                  autoSkip: false,
                  color(labelContext) {
                    return shouldHidePenultimateTimelineTick(
                      labelContext.scale.ticks,
                      labelContext.index,
                      Math.max(labelContext.scale.max - labelContext.scale.min, 1),
                      labelContext.scale.width
                    )
                      ? "rgba(255,255,255,0)"
                      : labelColor;
                  },
                  font: {
                    family: '"JetBrains Mono", "SFMono-Regular", "Consolas", monospace',
                    size: 9
                  },
                  callback(value, tickIndex, ticks) {
                    if (shouldHidePenultimateTimelineTick(
                      ticks,
                      tickIndex,
                      Math.max(this.max - this.min, 1),
                      this.width
                    )) {
                      return "";
                    }
                    return formatTimelineAxisLabel(value);
                  }
                },
                title: {
                  display: true,
                  text: "Time",
                  color: labelColor,
                  font: {
                    family: '"JetBrains Mono", "SFMono-Regular", "Consolas", monospace',
                    size: 8
                  }
                }
              },
              y: {
                min: 0,
                max: 100,
                ticks: {
                  stepSize: 50,
                  color: labelColor,
                  font: {
                    family: '"JetBrains Mono", "SFMono-Regular", "Consolas", monospace',
                    size: 9
                  },
                  callback(value) {
                    return value + "%";
                  }
                },
                grid: {
                  color: gridColor
                },
                border: {
                  color: axisColor
                },
                title: {
                  display: true,
                  text: "Brightness",
                  color: labelColor,
                  font: {
                    family: '"JetBrains Mono", "SFMono-Regular", "Consolas", monospace',
                    size: 8
                  }
                }
              }
            }
          }
        });

        const wheelZoomHandler = (event) => {
          event.preventDefault();
          if (!chart.chartArea) {
            return;
          }
          zoomTimelineChartX(chart, maxTime, event.deltaY, event.offsetX);
        };

        canvas.addEventListener("wheel", wheelZoomHandler, { passive: false });
        chart.$wheelZoomHandler = wheelZoomHandler;
        timelineCharts.push(chart);
      });

      Array.from(timelineList.querySelectorAll(".timeline-reset-zoom")).forEach((button, index) => {
        button.addEventListener("click", () => {
          const chart = timelineCharts[index];
          if (chart && typeof chart.resetZoom === "function") {
            chart.resetZoom();
          }
        });
      });
    }

    function renderChannels() {
      if (!appState.channels.length) {
        destroyTimelineCharts();
        if (previewStage) {
          previewStage.innerHTML = "";
        }
        timelineList.innerHTML = '<div class="empty-state">No valid channels available to preview.</div>';
        return;
      }

      const config = getSelectedVehicleConfig();

      if (previewStage) {
        if (config.type === "image") {
          previewStage.innerHTML = "";

          const shell = document.createElement("div");
          shell.className = "preview-shell image";

          ["left", "right"].forEach((side) => {
            const card = document.createElement("section");
            card.className = "preview-card";

            const label = document.createElement("div");
            label.className = "vehicle-label";
            label.textContent = side === "left" ? "Left Headlight" : "Right Headlight";

            card.appendChild(label);
            card.appendChild(createVehicleSvg(side, config));
            shell.appendChild(card);
          });

          previewStage.appendChild(shell);
        } else {
          previewStage.innerHTML = `
            <div class="preview-shell grid">
              <div class="car-body">
                <div class="headlight-cluster left">
                  <div class="vehicle-label">Left Headlight</div>
                  <div class="headlight-bank left" data-preview-bank="left"></div>
                </div>
                <div class="headlight-cluster right">
                  <div class="vehicle-label">Right Headlight</div>
                  <div class="headlight-bank right" data-preview-bank="right"></div>
                </div>
              </div>
            </div>
          `;

          const leftBank = previewStage.querySelector('[data-preview-bank="left"]');
          const rightBank = previewStage.querySelector('[data-preview-bank="right"]');

          appState.channels.forEach((channelEntry) => {
            const channelName = "CH " + toHex(channelEntry.channel);
            if (channelEntry.leftSequence) {
              leftBank.appendChild(createBeam(channelName, "left", channelEntry.channel));
            }
            if (channelEntry.rightSequence) {
              rightBank.appendChild(createBeam(channelName, "right", channelEntry.channel));
            }
          });
        }
      }

      timelineList.innerHTML = appState.channels.map((channelEntry) => {
        const chips = [];
        const channelLabel = getVehicleChannelLabel(channelEntry.channel, config);
        if (channelEntry.leftSequence) {
          chips.push('<span class="chip"><span class="chip-dot" style="background: var(--left);"></span>Left ' + channelEntry.leftSequence.pairCount + ' pairs</span>');
        }
        if (channelEntry.rightSequence) {
          chips.push('<span class="chip"><span class="chip-dot" style="background: var(--right);"></span>Right ' + channelEntry.rightSequence.pairCount + ' pairs</span>');
        }
        if (channelEntry.sameCurve) {
          chips.push('<span class="chip"><span class="chip-dot" style="background: var(--shared);"></span>Matching curves</span>');
        }

        return `
          <div class="timeline-row">
            <div class="timeline-row-header">
              <div class="timeline-row-title">Channel ${channelEntry.channel}${channelLabel ? ' <span class="timeline-channel-label">' + escapeHtml(channelLabel) + '</span>' : ""}</div>
              <div class="timeline-row-actions">
                ${chips.join("")}
                <button class="secondary timeline-reset-zoom" type="button">Reset Zoom</button>
              </div>
            </div>
            <div class="timeline-chart-wrap">
              <canvas class="timeline-chart" aria-label="Channel ${channelEntry.channel} timeline"></canvas>
            </div>
          </div>
        `;
      }).join("");

      renderTimelineCharts();
      syncPreviewBrightness();
    }

    function createBeam(label, side, channel) {
      const wrapper = document.createElement("div");
      wrapper.className = "beam " + side;
      wrapper.dataset.channel = String(channel);
      const name = document.createElement("span");
      name.className = "beam-label";
      name.textContent = label;
      wrapper.appendChild(name);
      return wrapper;
    }

    function syncPreviewBrightness() {
      const config = getSelectedVehicleConfig();

      if (previewStage) {
        if (config.type === "image") {
          ["left", "right"].forEach((side) => {
            (config.channels || []).forEach((channel) => {
              if (channel.physicalLight) {
                return;
              }
              const element = previewStage.querySelector("#" + side + "-light-ch-" + channel.id);
              const brightness = getPreviewBrightness(side, channel.id, config);
              applyPreviewBrightness(element, brightness, side);
            });
          });
        } else {
          previewStage.querySelectorAll(".beam").forEach((beam) => {
            const side = beam.classList.contains("left") ? "left" : "right";
            const brightness = getPreviewBrightness(side, Number(beam.dataset.channel), config);
            applyPreviewBrightness(beam, brightness, side);
          });
        }
      }

      timelineMeta.textContent = appState.channels.length
        ? formatMs(appState.currentMs) + " / " + formatMs(appState.totalMs)
        : "No valid payload parsed yet.";

      timelineCharts.forEach((chart) => {
        chart.options.plugins.timelinePlayhead.currentMs = appState.currentMs;
        chart.update("none");
      });
    }

    function renderTemplates() {
      if (!templateList) {
        return;
      }

      if (!TEMPLATES.length) {
        templateList.innerHTML = '<tr><td colspan="7" class="muted">No templates loaded.</td></tr>';
        return;
      }

      templateList.innerHTML = TEMPLATES.map((template) => `
        <tr>
          <td>${escapeHtml(template.name)}</td>
          <td>${escapeHtml(template.author)}</td>
          <td>${escapeHtml(template.car)}</td>
          <td>${escapeHtml(template.spec)}</td>
          <td><span class="checkmark ${template.lci ? "true" : "false"}">${template.lci ? "✓" : "✕"}</span></td>
          <td><span class="checkmark ${template.laserLight ? "true" : "false"}">${template.laserLight ? "✓" : "✕"}</span></td>
          <td>
            <div class="actions">
              <button class="primary template-apply" type="button" data-template-id="${escapeHtml(template.id)}">Copy To Build</button>
              ${template.sourceUrl ? `<a class="secondary table-link action-link" href="${escapeHtml(template.sourceUrl)}" target="_blank" rel="noreferrer">Source</a>` : ""}
            </div>
          </td>
        </tr>
      `).join("");

      templateList.querySelectorAll(".template-apply").forEach((button) => {
        button.addEventListener("click", () => {
          window.location.href = "index.html?template=" + encodeURIComponent(button.dataset.templateId);
        });
      });
    }

    async function loadTemplates() {
      if (!templateList) {
        return;
      }

      templateList.innerHTML = '<tr><td colspan="7" class="muted">Loading templates...</td></tr>';

      try {
        const manifestResponse = await fetch(TEMPLATE_MANIFEST_PATH);
        if (!manifestResponse.ok) {
          throw new Error("Template manifest request failed with status " + manifestResponse.status + ".");
        }

        const templateFiles = await manifestResponse.json();
        if (!Array.isArray(templateFiles)) {
          throw new Error("Template manifest must be a JSON array of file names.");
        }

        const loadedTemplates = await Promise.all(templateFiles.map(async (fileName) => {
          const response = await fetch("templates/" + fileName);
          if (!response.ok) {
            throw new Error("Template file " + fileName + " failed with status " + response.status + ".");
          }
          return response.json();
        }));

        TEMPLATES = loadedTemplates;
        renderTemplates();
      } catch (error) {
        console.error("Template loading failed", error);
        TEMPLATES = [];
        templateList.innerHTML = '<tr><td colspan="7" class="muted">Templates could not be loaded. Serve this project over HTTP so the JSON files can be fetched.</td></tr>';
      }
    }

    async function loadTemplateById(templateId) {
      const response = await fetch("templates/" + encodeURIComponent(templateId) + ".json");
      if (!response.ok) {
        throw new Error("Template file " + templateId + ".json failed with status " + response.status + ".");
      }
      return response.json();
    }

    function selectedModelLabel(modelId) {
      return getVehicleConfig(modelId).name;
    }

    function setSectionVisibility(element, visible) {
      if (element) {
        element.classList.toggle("visible", visible);
      }
    }

    function renderValidationFeedback(level, message) {
      if (!validationFeedback) {
        return;
      }

      validationFeedback.className = "validation-feedback" + (level ? " " + level : "");
      validationFeedback.textContent = message || "";
    }

    function renderValidationFeedbackDetails(issues) {
      if (!validationFeedbackDetails) {
        return;
      }

      if (!issues.length) {
        validationFeedbackDetails.className = "validation-feedback-details";
        validationFeedbackDetails.innerHTML = "";
        return;
      }

      validationFeedbackDetails.className = "validation-feedback-details visible";
      validationFeedbackDetails.innerHTML = "<ul>" + issues.map((issue) => "<li>" + escapeHtml(issue) + "</li>").join("") + "</ul>";
    }

    function resetValidationState() {
      stopPlayback();
      appState.channels = [];
      appState.parsedSequences.left = [];
      appState.parsedSequences.right = [];
      appState.previewTimeline = null;
      appState.totalMs = 0;
      appState.currentMs = 0;
      timelineSlider.value = "0";
      timelineSlider.max = "1000";
      timelineMeta.textContent = "No valid payload parsed yet.";
      renderValidationFeedback("", "");
      renderValidationFeedbackDetails([]);
      renderChannels();
      setSectionVisibility(buildStack, false);
    }

    function setSelectedModel(modelId) {
      appState.selectedModel = modelId;
      if (carModelSelect) {
        carModelSelect.value = modelId;
      }
      setSectionVisibility(payloadCard, Boolean(modelId));

      if (selectedModelCopy) {
        selectedModelCopy.textContent = modelId
          ? "Editing payload for " + selectedModelLabel(modelId) + "."
          : "Select a vehicle to begin.";
      }
    }

    function inferModelFromTemplate(template) {
      if (!template) {
        return "generic";
      }

      const car = String(template.car || "").toUpperCase();
      const spec = String(template.spec || "").toUpperCase();

      if (car === "G20" && template.laserLight && !template.lci && spec === "US") {
        return "bmw-g20-2022-us-laser";
      }

      if (car === "G20" && template.laserLight && !template.lci) {
        return "bmw-g20-2020-laser";
      }

      if (car === "G22" && template.laserLight && !template.lci) {
        return "bmw-g22-2020-laser";
      }

      if (car === "G30" && template.laserLight && !template.lci && spec === "EU") {
        return "bmw-g30-2020-eu-laser";
      }

      if (car === "G80" && template.laserLight && !template.lci && spec === "EU") {
        return "bmw-g80-2022-eu-laser";
      }

      if (car === "G82" && template.laserLight && !template.lci && spec === "EU") {
        return "bmw-g82-2022-eu-laser";
      }

      return "generic";
    }

    function applyTemplate(template) {
      if (!template) {
        return;
      }

      setSelectedModel(inferModelFromTemplate(template));
      inputs.leftStage1.value = formatBytes(template.leftStage1);
      inputs.leftStage2.value = formatBytes(template.leftStage2);
      inputs.rightStage1.value = formatBytes(template.rightStage1);
      inputs.rightStage2.value = formatBytes(template.rightStage2);
      updateAllMeters();
      importAssistantFromRaw();
      validateAndRender();
    }

    async function initFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const templateId = params.get("template");

      if (templateId) {
        try {
          const template = await loadTemplateById(templateId);
          applyTemplate(template);
        } catch (error) {
          console.error("Template loading failed", error);
        }
      }
    }

    function validateAndRender() {
      if (!appState.selectedModel) {
        renderValidationFeedback("bad", "Invalid payload. Select a vehicle before validating.");
        renderValidationFeedbackDetails([]);
        return;
      }

      const fieldResults = {};
      let fatalIssueCount = 0;
      let hasAnyInput = false;
      const issues = [];

      Object.keys(inputs).forEach((key) => {
        const parsed = splitHexBytes(inputs[key].value);
        const limit = STAGE_LIMITS[key];
        fieldResults[key] = parsed;
        updateMeter(key, parsed.bytes.length, limit);
        normalizedOutputs[key].value = formatPaddedStageBytes(parsed.bytes, limit);
        hasAnyInput = hasAnyInput || parsed.bytes.length > 0;

        if (parsed.issues.length) {
          fatalIssueCount += parsed.issues.length;
          parsed.issues.forEach((issue) => {
            issues.push(inputLabel(key) + ": " + issue);
          });
        }

        if (parsed.bytes.length > limit) {
          fatalIssueCount += 1;
          issues.push(inputLabel(key) + ": Contains " + parsed.bytes.length + " bytes, exceeding the " + limit + "-byte stage limit.");
        }
      });

      const leftPayload = [
        ...getPaddedStageBytes(fieldResults.leftStage1.bytes, STAGE_LIMITS.leftStage1),
        ...getPaddedStageBytes(fieldResults.leftStage2.bytes, STAGE_LIMITS.leftStage2)
      ];
      const rightPayload = [
        ...getPaddedStageBytes(fieldResults.rightStage1.bytes, STAGE_LIMITS.rightStage1),
        ...getPaddedStageBytes(fieldResults.rightStage2.bytes, STAGE_LIMITS.rightStage2)
      ];

      const parsedLeft = parsePayload(leftPayload, "Left payload");
      const parsedRight = parsePayload(rightPayload, "Right payload");

      parsedLeft.issues.forEach((issue) => {
        fatalIssueCount += 1;
        issues.push(issue);
      });
      parsedRight.issues.forEach((issue) => {
        fatalIssueCount += 1;
        issues.push(issue);
      });

      appState.channels = fatalIssueCount ? [] : buildChannelMap(parsedLeft, parsedRight);
      appState.parsedSequences.left = fatalIssueCount ? [] : parsedLeft.sequences;
      appState.parsedSequences.right = fatalIssueCount ? [] : parsedRight.sequences;
      appState.previewTimeline = fatalIssueCount ? null : computePreviewTimeline(getSelectedVehicleConfig());
      appState.totalMs = appState.previewTimeline
        ? appState.previewTimeline.totalDuration
        : appState.channels.reduce((maxValue, channel) => Math.max(maxValue, channel.totalMs), 0);
      appState.currentMs = 0;
      timelineSlider.value = "0";

      setSectionVisibility(buildStack, true);
      renderValidationFeedback(
        fatalIssueCount || !hasAnyInput ? "bad" : "good",
        fatalIssueCount
          ? "Invalid payload. Found " + fatalIssueCount + " blocking issue" + (fatalIssueCount === 1 ? "" : "s") + "."
          : !hasAnyInput
            ? "Invalid payload. Enter payload data before validating."
            : appState.channels.length
              ? "Valid payload. Parsed " + appState.channels.length + " channel" + (appState.channels.length === 1 ? "" : "s") + " with a " + formatMs(appState.totalMs) + " preview."
              : "Valid payload. No previewable channels were found."
      );
      renderValidationFeedbackDetails(fatalIssueCount ? issues : []);
      renderChannels();
      syncPlaybackBounds();
    }

    function syncPlaybackBounds() {
      if (!appState.totalMs) {
        timelineSlider.max = "1000";
        timelineMeta.textContent = "No valid payload parsed yet.";
        stopPlayback();
        return;
      }

      timelineSlider.max = String(appState.totalMs);
      timelineSlider.value = String(appState.currentMs);
      timelineMeta.textContent = formatMs(appState.currentMs) + " / " + formatMs(appState.totalMs);
    }

    function updateMeter(key, byteCount, limit) {
      const parts = meterParts[key];
      const ratio = limit ? Math.min(byteCount / limit, 1) : 0;
      parts.count.textContent = byteCount + " bytes";
      parts.capacity.textContent = Math.round((byteCount / limit) * 100 || 0) + "%";
      parts.fill.style.width = (ratio * 100).toFixed(1) + "%";
      parts.fill.style.background = byteCount > limit ? "var(--bad)" : "var(--good)";
    }

    function clearAll() {
      Object.values(inputs).forEach((input) => {
        input.value = "";
      });
      Object.values(normalizedOutputs).forEach((output) => {
        output.value = "";
      });
      updateAllMeters();
      appState.assistant.left = [];
      appState.assistant.right = [];
      renderAssistant();
      resetValidationState();
    }

    function updateAllMeters() {
      Object.keys(inputs).forEach((key) => {
        const parsed = splitHexBytes(inputs[key].value);
        updateMeter(key, parsed.bytes.length, STAGE_LIMITS[key]);
      });
    }

    function playLoop(timestamp) {
      if (!appState.playing) {
        return;
      }
      if (!appState.lastTick) {
        appState.lastTick = timestamp;
      }
      const delta = timestamp - appState.lastTick;
      appState.lastTick = timestamp;

      appState.currentMs += delta;
      if (appState.currentMs > appState.totalMs) {
        appState.currentMs = 0;
      }

      timelineSlider.value = String(Math.round(appState.currentMs));
      syncPreviewBrightness();
      appState.animationFrame = requestAnimationFrame(playLoop);
    }

    function startPlayback() {
      if (!appState.totalMs) {
        return;
      }
      appState.playing = true;
      appState.lastTick = 0;
      playToggle.textContent = "Pause";
      appState.animationFrame = requestAnimationFrame(playLoop);
    }

    function stopPlayback() {
      appState.playing = false;
      appState.lastTick = 0;
      playToggle.textContent = "Play";
      if (appState.animationFrame) {
        cancelAnimationFrame(appState.animationFrame);
        appState.animationFrame = 0;
      }
    }

    function togglePlayback() {
      if (appState.playing) {
        stopPlayback();
      } else {
        startPlayback();
      }
    }

    function inputLabel(key) {
      return {
        leftStage1: "Left staging 1",
        leftStage2: "Left staging 2",
        rightStage1: "Right staging 1",
        rightStage2: "Right staging 2"
      }[key] || key;
    }

    function toHex(value) {
      return value.toString(16).toUpperCase().padStart(2, "0");
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function formatMs(value) {
      return Math.round(value) + " ms";
    }

    function escapeHtml(value) {
      return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function onElement(element, eventName, handler) {
      if (element) {
        element.addEventListener(eventName, handler);
      }
    }

    async function copyNormalizedOutput(targetId, button) {
      const target = document.getElementById(targetId);
      if (!target || !target.value) {
        if (button) {
          const original = button.textContent;
          button.textContent = "Nothing To Copy";
          window.setTimeout(() => {
            button.textContent = original;
          }, 1400);
        }
        return;
      }

      let copied = false;

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(target.value);
          copied = true;
        }
      } catch (error) {
        copied = false;
      }

      if (!copied) {
        target.focus();
        target.select();
        try {
          copied = document.execCommand("copy");
        } catch (error) {
          copied = false;
        }
        target.setSelectionRange(target.value.length, target.value.length);
        target.blur();
      }

      if (button) {
        const original = button.dataset.labelOriginal || button.textContent;
        button.dataset.labelOriginal = original;
        button.textContent = copied ? "Copied" : "Copy Failed";
        window.setTimeout(() => {
          button.textContent = original;
        }, 1400);
      }
    }

    function bindBuildPageEvents() {
      onElement(carModelSelect, "change", () => {
        setSelectedModel(carModelSelect.value);
        resetValidationState();
      });

      onElement(document.getElementById("analyze-button"), "click", validateAndRender);
      onElement(document.getElementById("clear-button"), "click", clearAll);
      onElement(document.getElementById("assistant-add-left"), "click", () => addAssistantChannel("left"));
      onElement(document.getElementById("assistant-add-right"), "click", () => addAssistantChannel("right"));
      onElement(document.getElementById("assistant-sync-left-to-right"), "click", () => syncAssistantSide("left", "right"));
      onElement(document.getElementById("assistant-sync-right-to-left"), "click", () => syncAssistantSide("right", "left"));
      onElement(playToggle, "click", togglePlayback);

      inputModeTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          setInputMode(tab.dataset.inputModeTarget);
          if (tab.dataset.inputModeTarget === "assistant" && !appState.assistant.left.length && !appState.assistant.right.length) {
            importAssistantFromRaw();
          }
        });
      });

      onElement(timelineSlider, "input", () => {
        appState.currentMs = Number(timelineSlider.value);
        syncPreviewBrightness();
      });

      Object.keys(inputs).forEach((key) => {
        onElement(inputs[key], "input", () => {
          resetValidationState();
          const parsed = splitHexBytes(inputs[key].value);
          updateMeter(key, parsed.bytes.length, STAGE_LIMITS[key]);
        });
      });

      document.querySelectorAll("[data-copy-target]").forEach((button) => {
        onElement(button, "click", () => {
          copyNormalizedOutput(button.dataset.copyTarget, button);
        });
      });
    }

    async function bootstrap() {
      if (isTemplatesPage) {
        await loadTemplates();
        return;
      }

      if (isBuildPage) {
        bindBuildPageEvents();
        setSelectedModel("");
        setSectionVisibility(buildStack, false);
        clearAll();
        setInputMode("raw");
        await initFromUrl();
      }
    }

    bootstrap();
