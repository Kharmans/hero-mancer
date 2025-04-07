import { DOMManager, HeroMancer, HM } from './index.js';

const { DialogV2 } = foundry.applications.api;

/**
 * Handles ability score rolling functionality for character creation
 * @class
 */
export class StatRoller {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static chainRollEnabled = false;

  static isRolling = false;

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Initiates the stat rolling process
   * @param {HTMLElement} form - The form containing the ability score input
   * @returns {Promise<void>}
   * @throws {Error} If form validation fails or rolling encounters an error
   * @static
   */
  static async rollAbilityScore(form) {
    if (this.isRolling) {
      HM.log(2, 'Rolling already in progress, please wait');
      return;
    }

    try {
      const rollData = await this.#prepareRollData(form);
      if (!rollData) return;

      if (rollData.hasExistingValue) {
        await this.#handleExistingValue(rollData);
      } else if (rollData.chainedRolls) {
        await this.rollAllStats(rollData.rollFormula);
      } else {
        await this.rollSingleAbilityScore(rollData.rollFormula, rollData.index, rollData.input);
      }
    } catch (error) {
      HM.log(1, 'Error while rolling stat:', error);
      ui.notifications.error('hm.errors.roll-failed', { localize: true });
      this.isRolling = false;
    }
  }

  /**
   * Prepares data needed for rolling
   * @param {HTMLElement} form - The form containing the ability score input
   * @returns {Promise<Object|null>} Roll data or null if invalid
   * @private
   * @static
   */
  static async #prepareRollData(form) {
    if (!form) {
      HM.log(2, 'Invalid form provided to rollAbilityScore');
      return null;
    }

    const rollFormula = await this.getAbilityScoreRollFormula();
    const chainedRolls = await game.settings.get(HM.ID, 'chainedRolls');
    const index = form.getAttribute('data-index');
    const input = this.getAbilityInput(index);
    const hasExistingValue = !this.chainRollEnabled && input?.value?.trim() !== '';

    return { rollFormula, chainedRolls, index, input, hasExistingValue };
  }

  /**
   * Handle the case where there's an existing value in the input
   * @param {Object} rollData - The prepared roll data
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #handleExistingValue(rollData) {
    await this.#promptForAbilityScoreReroll(rollData.rollFormula, rollData.chainedRolls, rollData.index, rollData.input);
  }

  /**
   * Gets the roll formula from settings or sets default
   * @returns {Promise<string>} The roll formula to use
   * @static
   */
  static async getAbilityScoreRollFormula() {
    let formula = game.settings.get(HM.ID, 'customRollFormula');
    if (!formula?.trim()) {
      formula = '4d6kh3';
      await game.settings.set(HM.ID, 'customRollFormula', formula);
      HM.log(2, 'Roll formula was empty. Resetting to default:', formula);
    }
    return formula;
  }

  /**
   * Gets the ability score input element
   * @param {string} index - The ability block index
   * @returns {HTMLElement|null} The input element or null if not found
   * @static
   */
  static getAbilityInput(index) {
    if (!index) {
      HM.log(2, 'Invalid ability index provided to getAbilityInput');
      return null;
    }

    const block = document.getElementById(`ability-block-${index}`);
    return block?.querySelector('.ability-score');
  }

  /**
   * Checks if any ability scores have existing values
   * @returns {boolean} True if any ability scores have values
   * @static
   */
  static hasExistingValues() {
    return Array.from(document.querySelectorAll('.ability-score')).some((input) => input.value?.trim() !== '');
  }

  /**
   * Performs a single ability score roll
   * @param {string} rollFormula - The formula to use for rolling
   * @param {string} index - The ability block index
   * @param {HTMLElement} input - The ability score input element
   * @returns {Promise<boolean>} Success status
   * @static
   */
  static async rollSingleAbilityScore(rollFormula, index, input) {
    if (!rollFormula) {
      HM.log(2, 'No roll formula provided for ability score roll');
      return false;
    }

    // Update UI to show rolling status
    this.#updateRollingStatus(index, true);

    try {
      const rollResult = await this.#performRoll(rollFormula);
      if (!rollResult) return false;

      // Apply roll result to input
      if (input) {
        input.value = rollResult;
        input.focus();

        // Trigger change event
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } else {
        HM.log(2, `No input field found for ability index ${index}.`);
        return false;
      }
    } catch (error) {
      HM.log(1, `Failed to roll ${rollFormula}:`, error);
      ui.notifications.error('hm.errors.roll-failed', { localize: true });
      return false;
    } finally {
      this.chainRollEnabled = false;
      this.#updateRollingStatus(index, false);
    }
  }

  /**
   * Updates the visual status for rolling
   * @param {string} index - The ability block index
   * @param {boolean} isRolling - Whether rolling is in progress
   * @private
   * @static
   */
  static #updateRollingStatus(index, isRolling) {
    if (!index) return;

    const block = document.getElementById(`ability-block-${index}`);
    if (!block) return;

    const diceIcon = block.querySelector('.fa-dice-d6');
    if (diceIcon) {
      if (isRolling) {
        diceIcon.classList.add('rolling');
      } else {
        diceIcon.classList.remove('rolling');
      }
    }
  }

  /**
   * Performs a roll and constrains the result
   * @param {string} rollFormula - The formula to use for rolling
   * @returns {Promise<number|null>} The constrained roll result or null if failed
   * @private
   * @static
   */
  static async #performRoll(rollFormula) {
    try {
      const roll = new Roll(rollFormula);
      await roll.evaluate();

      // Apply min/max constraints to roll result
      const { MIN, MAX } = HM.ABILITY_SCORES;
      const constrainedResult = Math.max(MIN, Math.min(MAX, roll.total));

      // Log original and constrained values if different
      if (roll.total !== constrainedResult) {
        HM.log(3, `Roll result: ${roll.total} (constrained to ${constrainedResult})`);
      } else {
        HM.log(3, 'Roll result:', roll.total);
      }

      return constrainedResult;
    } catch (error) {
      HM.log(1, `Failed to evaluate roll formula "${rollFormula}":`, error);
      return null;
    }
  }

  /**
   * Rolls all ability scores in sequence
   * @param {string} rollFormula - The formula to use for rolling
   * @returns {Promise<boolean>} Success status
   * @static
   */
  static async rollAllStats(rollFormula) {
    if (!rollFormula) {
      HM.log(2, 'No roll formula provided for ability score roll');
      return false;
    }

    this.isRolling = true;
    const blocks = this.#getAbilityBlocks();

    if (!blocks.length) {
      HM.log(2, 'No ability blocks found for rolling');
      this.isRolling = false;
      return false;
    }

    try {
      await this.#rollAbilitiesSequentially(blocks, rollFormula);
      DOMManager.updateAbilitiesSummary();
      return true;
    } catch (error) {
      HM.log(1, 'Error in chain rolling:', error);
      ui.notifications.error('hm.errors.roll-failed', { localize: true });
      return false;
    } finally {
      this.isRolling = false;
      this.chainRollEnabled = false;
    }
  }

  /**
   * Gets all ability blocks from the document
   * @returns {NodeList} Collection of ability blocks
   * @private
   * @static
   */
  static #getAbilityBlocks() {
    return document.querySelectorAll('.ability-block');
  }

  /**
   * Rolls abilities sequentially with animation
   * @param {NodeList} blocks - The ability blocks
   * @param {string} rollFormula - The formula to use for rolling
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #rollAbilitiesSequentially(blocks, rollFormula) {
    const delay = game.settings.get(HM.ID, 'rollDelay') || 500;
    const { MIN, MAX } = HM.ABILITY_SCORES;

    // Create a batch of promises for each block
    const rollPromises = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];

      // Create a promise for this roll
      const rollPromise = new Promise((resolve) => {
        // Use an immediately invoked function expression for the async operations
        (async function () {
          try {
            // Add delay for sequential appearance
            if (i > 0) {
              await new Promise((r) => setTimeout(r, delay));
            }

            // Apply visual effect
            const diceIcon = block.querySelector('.fa-dice-d6');
            if (diceIcon) {
              diceIcon.classList.add('rolling');
            }

            // Perform the roll
            const constrainedResult = await StatRoller.#performRoll(rollFormula);

            // Update the input
            const input = block.querySelector('.ability-score');
            if (input && constrainedResult !== null) {
              input.value = constrainedResult;
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Remove visual effect after a brief period
            setTimeout(() => {
              if (diceIcon) diceIcon.classList.remove('rolling');
              resolve();
            }, 100);
          } catch (error) {
            HM.log(1, `Error rolling for ability ${i}:`, error);
            resolve(); // Resolve despite error to continue the sequence
          }
        })();
      });

      rollPromises.push(rollPromise);
    }

    // Wait for all rolls to complete
    await Promise.all(rollPromises);
  }

  /**
   * Gets the default standard array for ability scores
   * @returns {string} Comma-separated string of ability scores
   * @static
   */
  static getStandardArrayDefault() {
    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
    const extraAbilities = Math.max(0, abilitiesCount - 6);
    return this.getStandardArray(extraAbilities).map(String).join(',');
  }

  /**
   * Validates and sets a custom standard array
   * @param {string} value - Comma-separated string of ability scores
   * @returns {boolean} Success status
   * @static
   */
  static validateAndSetCustomStandardArray(value) {
    if (!value) {
      HM.log(2, 'Empty value provided for standard array');
      return false;
    }

    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;

    // Check format: comma-separated digits
    if (!/^(\d+,)*\d+$/.test(value)) {
      ui.notifications.warn('hm.settings.custom-standard-array.invalid-format', { localize: true });
      return false;
    }

    // Parse scores
    let scores = value.split(',').map((num) => {
      const parsed = parseInt(num.trim(), 10);
      return isNaN(parsed) ? 0 : parsed;
    });

    // Validate count
    if (scores.length < abilitiesCount) {
      HM.log(2, `Standard array too short: ${scores.length} values for ${abilitiesCount} abilities`);
      scores = this.getStandardArrayDefault().split(',').map(Number);
      ui.notifications.info('hm.settings.custom-standard-array.reset-default', { localize: true });
    }

    // Check values against min/max
    const { MIN, MAX } = HM.ABILITY_SCORES;
    const outOfRangeValues = scores.filter((val) => val < MIN || val > MAX);

    if (outOfRangeValues.length > 0) {
      // Only show the warning if there are actual values to adjust
      if (outOfRangeValues.some((val) => val !== 0 && !isNaN(val))) {
        ui.notifications.warn(
          game.i18n.format('hm.settings.ability-scores.standard-array-fixed', {
            original: outOfRangeValues.join(', '),
            min: MIN,
            max: MAX
          })
        );
      }

      // Adjust values to stay within constraints
      scores = scores.map((val) => Math.max(MIN, Math.min(MAX, val)));
    }

    // Save the validated array
    const sortedScores = scores.sort((a, b) => b - a).join(',');
    game.settings.set(HM.ID, 'customStandardArray', sortedScores);
    return true;
  }

  /**
   * Generates a standard array of ability scores
   * @param {number} extraAbilities - Number of additional abilities beyond the base six
   * @returns {number[]} Array of ability scores in descending order
   * @static
   */
  static getStandardArray(extraAbilities) {
    // Validate input
    const extraCount = Math.max(0, parseInt(extraAbilities) || 0);

    // Use default D&D 5e standard array adjusted for constraints
    const standardArray = [15, 14, 13, 12, 10, 8];
    const extraValues = Array(extraCount).fill(11);

    // Apply min/max constraints
    const { MIN, MAX } = HM.ABILITY_SCORES;
    const adjustedArray = [...standardArray, ...extraValues].map((val) => Math.max(MIN, Math.min(MAX, val)));

    return adjustedArray.sort((a, b) => b - a);
  }

  /**
   * Calculates total points available for point buy
   * @returns {number} Total points available
   * @static
   */
  static getTotalPoints() {
    const customTotal = game.settings.get(HM.ID, 'customPointBuyTotal');
    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
    const extraPoints = Math.max(0, abilitiesCount - 6) * 3;
    const defaultTotal = 27 + extraPoints;

    // Only use customTotal if it's greater than 0 (indicating it was set)
    // and different from the default calculation
    if (customTotal > 0 && customTotal !== defaultTotal) {
      return customTotal;
    }

    return defaultTotal;
  }

  /**
   * Gets the point cost for a given ability score
   * @param {number} score - The ability score
   * @returns {number} Point cost for the score
   * @static
   */
  static getPointBuyCostForScore(score) {
    // Validate input
    const validScore = parseInt(score);
    if (isNaN(validScore)) {
      HM.log(2, `Invalid ability score provided: ${score}`);
      return 0;
    }

    const costs = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

    // Handle scores outside the standard scale but within our min/max
    const { MIN, MAX } = HM.ABILITY_SCORES;

    // For scores lower than standard minimum
    if (validScore < 8 && validScore >= MIN) {
      // Negative costs for lower scores (saves points)
      return -1 * (8 - validScore);
    }

    // For scores higher than standard maximum
    if (validScore > 15 && validScore <= MAX) {
      // Exponential cost increase for higher scores
      return 9 + (validScore - 15) * 2;
    }

    return costs[validScore] ?? 0;
  }

  /**
   * Calculates total points spent on ability scores
   * @param {number[]} scores - Array of selected ability scores
   * @returns {number} Total points spent
   * @static
   */
  static calculateTotalPointsSpent(scores) {
    // Validate input
    if (!Array.isArray(scores)) {
      HM.log(2, 'Invalid scores array provided to calculateTotalPointsSpent');
      return 0;
    }

    const { MIN } = HM.ABILITY_SCORES;
    let total = 0;

    scores.forEach((score) => {
      // Parse the score to ensure it's a number
      const validScore = parseInt(score);
      if (isNaN(validScore)) return;

      // When MIN is higher than standard 8, adjust total calculation
      if (MIN > 8) {
        // Calculate cost as if starting from standard minimum
        const standardMinCost = this.getPointBuyCostForScore(MIN) - this.getPointBuyCostForScore(8);
        total += this.getPointBuyCostForScore(validScore) - standardMinCost;
      } else {
        total += this.getPointBuyCostForScore(validScore);
      }
    });

    return total;
  }

  /**
   * Builds ability scores data for rendering context
   * @returns {Array<object>} Array of ability data objects
   * @static
   */
  static buildAbilitiesContext() {
    return Object.entries(CONFIG.DND5E.abilities).map(([key, value]) => ({
      key,
      abbreviation: value.abbreviation.toUpperCase(),
      fullKey: value.fullKey.toUpperCase(),
      currentScore: HM.ABILITY_SCORES.DEFAULT
    }));
  }

  /**
   * Gets available roll methods with localized names
   * @returns {Object} Object with roll method localizations
   * @static
   */
  static getRollMethods() {
    return {
      pointBuy: game.i18n.localize('hm.app.abilities.methods.pointBuy'),
      standardArray: game.i18n.localize('hm.app.abilities.methods.standardArray'),
      manualFormula: game.i18n.localize('hm.app.abilities.methods.manual')
    };
  }

  /**
   * Gets and validates the current dice rolling method
   * @returns {string} The validated dice rolling method
   * @static
   */
  static getDiceRollingMethod() {
    let diceRollingMethod = game.settings.get(HM.ID, 'diceRollingMethod');

    // Get allowed methods configuration
    const allowedMethods = game.settings.get(HM.ID, 'allowedMethods');

    // Map settings keys to method names
    const methodMapping = {
      standardArray: 'standardArray',
      pointBuy: 'pointBuy',
      manual: 'manualFormula'
    };

    // Create array of allowed method names
    const validMethods = Object.entries(allowedMethods)
      .filter(([key, enabled]) => enabled)
      .map(([key]) => methodMapping[key])
      .filter(Boolean);

    // Select first allowed method if current isn't valid
    if (!diceRollingMethod || !validMethods.includes(diceRollingMethod)) {
      diceRollingMethod = validMethods[0];
      game.settings.set(HM.ID, 'diceRollingMethod', diceRollingMethod).catch((err) => HM.log(1, 'Failed to update diceRollingMethod setting:', err));

      HM.log(3, `Invalid dice rolling method - falling back to '${diceRollingMethod}'`);
    }

    return diceRollingMethod;
  }

  /**
   * Gets the standard array for ability scores
   * @param {string} [diceRollingMethod] - Optional pre-validated dice rolling method
   * @returns {Array} Array of ability score values
   * @static
   */
  static getStandardArrayValues(diceRollingMethod) {
    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
    const extraAbilities = abilitiesCount > 6 ? abilitiesCount - 6 : 0;
    const { MIN, MAX } = HM.ABILITY_SCORES;

    // Only use the provided method, don't call getDiceRollingMethod again
    if (diceRollingMethod === 'standardArray') {
      const customArray = game.settings.get(HM.ID, 'customStandardArray');
      if (customArray) {
        const parsedArray = customArray.split(',').map(Number);
        if (parsedArray.length >= abilitiesCount) {
          return parsedArray.map((val) => Math.max(MIN, Math.min(MAX, val)));
        }
      }
    }

    const standardArray = this.getStandardArray(extraAbilities);
    return standardArray.map((val) => Math.max(MIN, Math.min(MAX, val)));
  }

  /**
   * Adjusts an ability score in response to UI interaction
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} element - The button element
   * @static
   */
  static adjustScore(_event, element) {
    if (!element) return;

    const index = parseInt(element.getAttribute('data-ability-index'), 10);
    if (isNaN(index)) return;

    const adjustment = parseInt(element.getAttribute('data-adjust'), 10) || 0;
    DOMManager.changeAbilityScoreValue(index, adjustment, HeroMancer.selectedAbilities);
  }

  /**
   * Handle ability dropdown change events
   * @param {Event} event - The change event
   * @param {string} diceRollingMethod - Current dice rolling method
   */
  static handleAbilityDropdownChange(event, diceRollingMethod) {
    if (!event || !event.target) return;

    const dropdown = event.target;
    const index = parseInt(dropdown.dataset.index, 10);

    if (isNaN(index)) {
      HM.log(2, 'Invalid index in ability dropdown');
      return;
    }

    const abilityDropdowns = document.querySelectorAll('.ability-dropdown');
    const selectedValues = Array.from(abilityDropdowns).map((dropdown) => dropdown.value);
    const totalPoints = this.getTotalPoints();

    if (diceRollingMethod === 'manualFormula') {
      this.#handleManualFormulaDropdown(dropdown, abilityDropdowns, selectedValues);
    } else if (diceRollingMethod === 'standardArray') {
      this.#handleStandardArrayDropdown(dropdown, index, abilityDropdowns, selectedValues);
    } else if (diceRollingMethod === 'pointBuy') {
      this.#handlePointBuyDropdown(dropdown, index, abilityDropdowns, selectedValues, totalPoints);
    }
  }

  /**
   * Handle dropdown change for manual formula method
   * @param {HTMLElement} dropdown - The changed dropdown
   * @param {NodeList} abilityDropdowns - All ability dropdowns
   * @param {Array} selectedValues - Currently selected values
   * @private
   * @static
   */
  static #handleManualFormulaDropdown(dropdown, abilityDropdowns, selectedValues) {
    const value = dropdown.value;
    const scoreInput = dropdown.parentElement.querySelector('.ability-score');

    // Both dropdown and input should reference the selected ability
    dropdown.setAttribute('name', `abilities[${value}]`);
    if (scoreInput) {
      scoreInput.setAttribute('name', `abilities[${value}].score`);
    }

    // Disable options that are already selected elsewhere
    abilityDropdowns.forEach((otherDropdown, otherIndex) => {
      Array.from(otherDropdown.options).forEach((option) => {
        if (option.value && option.value !== '') {
          option.disabled = selectedValues.includes(option.value) && selectedValues[otherIndex] !== option.value;
        }
      });
    });
  }

  /**
   * Handle dropdown change for standard array method
   * @param {HTMLElement} dropdown - The changed dropdown
   * @param {number} index - The dropdown index
   * @param {NodeList} abilityDropdowns - All ability dropdowns
   * @param {Array} selectedValues - Currently selected values
   * @private
   * @static
   */
  static #handleStandardArrayDropdown(dropdown, index, abilityDropdowns, selectedValues) {
    const newValue = dropdown.value;

    // Update tracking array with new value
    selectedValues[index] = newValue;

    // Count value occurrences in the standard array
    const valueOccurrences = this.#countValueOccurrences(abilityDropdowns);

    // Count current selections of each value
    const selectedCounts = {};
    selectedValues.forEach((value, idx) => {
      if (!value) return;
      selectedCounts[value] = (selectedCounts[value] || 0) + 1;
    });

    // If the selected value exceeds available occurrences, clear one
    if (newValue && selectedCounts[newValue] > valueOccurrences[newValue]) {
      // Find the first other dropdown with this value (excluding current one)
      for (let i = 0; i < abilityDropdowns.length; i++) {
        if (i !== index && abilityDropdowns[i].value === newValue) {
          // Clear this dropdown
          abilityDropdowns[i].value = '';
          selectedValues[i] = '';
          break; // Only clear one
        }
      }
    }

    // Apply standard array handling to update the UI with visual indicators
    requestAnimationFrame(() => {
      DOMManager.handleStandardArrayMode(abilityDropdowns, selectedValues);
    });
  }

  /**
   * Count the occurrences of each value in the standard array
   * @param {NodeList} abilityDropdowns - Ability dropdown elements
   * @returns {Object} Map of values to occurrence counts
   * @private
   * @static
   */
  static #countValueOccurrences(abilityDropdowns) {
    const valueOccurrences = {};
    // Use the first dropdown to get all available options
    if (abilityDropdowns.length > 0) {
      const firstDropdown = abilityDropdowns[0];
      Array.from(firstDropdown.options).forEach((option) => {
        if (option.value) {
          valueOccurrences[option.value] = (valueOccurrences[option.value] || 0) + 1;
        }
      });
    }
    return valueOccurrences;
  }

  /**
   * Handle dropdown change for point buy method
   * @param {HTMLElement} dropdown - The changed dropdown
   * @param {number} index - The dropdown index
   * @param {NodeList} abilityDropdowns - All ability dropdowns
   * @param {Array} selectedValues - Currently selected values
   * @param {number} totalPoints - Total points available
   * @private
   * @static
   */
  static #handlePointBuyDropdown(dropdown, index, abilityDropdowns, selectedValues, totalPoints) {
    // Handle point buy case
    selectedValues[index] = dropdown.value || '';
    DOMManager.refreshAbilityDropdownsState(abilityDropdowns, selectedValues, totalPoints, 'pointBuy');
  }

  /* -------------------------------------------- */
  /*  Static Private Methods                      */
  /* -------------------------------------------- */

  /**
   * Shows the reroll confirmation dialog
   * @param {string} rollFormula - The formula to use for rolling
   * @param {boolean} chainedRolls - Whether chained rolls are enabled
   * @param {string} index - The ability block index
   * @param {HTMLElement} input - The ability score input element
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #promptForAbilityScoreReroll(rollFormula, chainedRolls, index, input) {
    const dialogConfig = this.#createRerollDialogConfig(rollFormula, chainedRolls, index, input);

    const dialog = new DialogV2(dialogConfig);
    dialog.render(true);
  }

  /**
   * Creates the configuration for the reroll dialog
   * @param {string} rollFormula - The formula to use for rolling
   * @param {boolean} chainedRolls - Whether chained rolls are enabled
   * @param {string} index - The ability block index
   * @param {HTMLElement} input - The ability score input element
   * @returns {Object} Dialog configuration
   * @private
   * @static
   */
  static #createRerollDialogConfig(rollFormula, chainedRolls, index, input) {
    return {
      window: {
        title: game.i18n.localize('hm.dialogs.reroll.title'),
        icon: 'fas fa-dice-d6'
      },
      content: this.#getRerollDialogContent(chainedRolls),
      classes: ['hm-reroll-dialog'],
      buttons: this.#getRerollDialogButtons(rollFormula, chainedRolls, index, input),
      rejectClose: false,
      modal: true,
      position: { width: 400 }
    };
  }

  /**
   * Gets the content for the reroll dialog
   * @param {boolean} chainedRolls - Whether chained rolls are enabled
   * @returns {string} The HTML content for the dialog
   * @private
   * @static
   */
  static #getRerollDialogContent(chainedRolls) {
    // Only show the chain roll checkbox if chain rolls are enabled in settings
    const chainRollCheckbox =
      chainedRolls ?
        `
    <div class="form-group">
      <label class="checkbox">
        <input type="checkbox" name="chainRoll" ${this.chainRollEnabled ? 'checked' : ''}>
        ${game.i18n.localize('hm.dialogs.reroll.chain-roll-label')}
      </label>
    </div>
  `
      : '';

    return `
    <form class="dialog-form">
      <p>${game.i18n.localize('hm.dialogs.reroll.content')}</p>
      ${chainRollCheckbox}
    </form>
  `;
  }

  /**
   * Gets the button configuration for the reroll dialog
   * @param {string} rollFormula - The formula to use for rolling
   * @param {boolean} chainedRolls - Whether chained rolls are enabled
   * @param {string} index - The ability block index
   * @param {HTMLElement} input - The ability score input element
   * @returns {object[]} The button configurations
   * @private
   * @static
   */
  static #getRerollDialogButtons(rollFormula, chainedRolls, index, input) {
    return [
      {
        action: 'confirm',
        label: game.i18n.localize('hm.dialogs.reroll.confirm'),
        icon: 'fas fa-check',
        default: true,
        async callback(event, button, dialog) {
          await StatRoller.#handleRerollConfirmation(button, dialog, rollFormula, chainedRolls, index, input);
        }
      },
      {
        action: 'cancel',
        label: game.i18n.localize('hm.dialogs.reroll.cancel'),
        icon: 'fas fa-times'
      }
    ];
  }

  /**
   * Handle confirmation of the reroll dialog
   * @param {HTMLElement} button - The clicked button
   * @param {DialogV2} dialog - The dialog instance
   * @param {string} rollFormula - The formula to use for rolling
   * @param {boolean} chainedRolls - Whether chained rolls are enabled
   * @param {string} index - The ability block index
   * @param {HTMLElement} input - The ability score input element
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #handleRerollConfirmation(button, dialog, rollFormula, chainedRolls, index, input) {
    const chainRollCheckbox = button.form.elements.chainRoll;
    StatRoller.chainRollEnabled = chainRollCheckbox?.checked ?? false;

    dialog.close();

    if (StatRoller.chainRollEnabled && chainedRolls) {
      await StatRoller.rollAllStats(rollFormula);
    } else {
      await StatRoller.rollSingleAbilityScore(rollFormula, index, input);
    }
  }
}
