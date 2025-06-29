import { EquipmentParser, FormValidation, HeroMancer, HM, JournalPageEmbed, SavedOptions, StatRoller, TableManager } from './index.js';

/**
 * Centralized DOM event and observer management
 * @class
 */
export class DOMManager {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @type {Map<HTMLElement, Map<string, Function[]>>} */
  static #listeners = new Map();

  /** @type {Map<string, MutationObserver>} */
  static #observers = new Map();

  /** @type {boolean} */
  static _isUpdatingEquipment = false;

  /** @type {Promise|null} */
  static _abilityUpdatePromise = null;

  /** @type {boolean} */
  static _pendingAbilityUpdate = false;

  /** @type {boolean} */
  static _updatingAbilities = false;

  /** @type {boolean} */
  static #equipmentUpdateInProgress = false;

  /** @type {Promise|null} */
  static #pendingEquipmentUpdate = null;

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Add and track an event listener
   * @param {HTMLElement} element - Target element
   * @param {string} eventType - Event type ('click', 'change', etc.)
   * @param {Function} callback - Event handler
   * @returns {Function} The callback for reference
   */
  static on(element, eventType, callback) {
    // Add error handling for invalid element
    if (!element) {
      HM.log(1, `Cannot add ${eventType} event listener: Invalid element provided`);
      return callback;
    }

    // Check for valid event type
    if (!eventType || typeof eventType !== 'string') {
      HM.log(1, `Cannot add event listener: Invalid event type "${eventType}"`);
      return callback;
    }

    // Ensure callback is a function
    if (typeof callback !== 'function') {
      HM.log(1, `Cannot add ${eventType} event listener: Callback must be a function`);
      return callback;
    }

    if (!this.#listeners.has(element)) {
      this.#listeners.set(element, new Map());
    }

    const elementEvents = this.#listeners.get(element);
    if (!elementEvents.has(eventType)) {
      elementEvents.set(eventType, []);
    }

    elementEvents.get(eventType).push(callback);

    try {
      element.addEventListener(eventType, callback);
    } catch (error) {
      HM.log(1, `Failed to add ${eventType} event listener:`, error);
    }

    return callback;
  }

  /**
   * Create and track a mutation observer
   * @param {string} id - Unique observer ID
   * @param {HTMLElement} element - Element to observe
   * @param {MutationObserverInit} options - Observer configuration
   * @param {Function} callback - Handler function
   * @returns {MutationObserver|null} The created observer or null if failed
   */
  static observe(id, element, options, callback) {
    // Validate parameters
    if (!id || typeof id !== 'string') {
      HM.log(1, 'Observer ID must be a non-empty string');
      return null;
    }

    if (!element || !(element instanceof Element)) {
      HM.log(1, `Cannot create observer "${id}": Invalid element provided`);
      return null;
    }

    if (typeof callback !== 'function') {
      HM.log(1, `Cannot create observer "${id}": Callback must be a function`);
      return null;
    }

    // Clean up existing observer with the same ID
    if (this.#observers.has(id)) {
      try {
        this.#observers.get(id).disconnect();
        HM.log(3, `Disconnected existing observer with ID "${id}"`);
      } catch (error) {
        HM.log(2, `Error disconnecting observer "${id}":`, error);
      }
    }

    try {
      // Create and configure the observer
      const observer = new MutationObserver(callback);
      observer.observe(element, options);
      this.#observers.set(id, observer);
      HM.log(3, `Created observer "${id}" for element`, element);
      return observer;
    } catch (error) {
      HM.log(1, `Failed to create observer "${id}":`, error);
      return null;
    }
  }

  /**
   * Clean up all registered listeners and observers
   * @returns {boolean} True if cleanup was successful
   */
  static cleanup() {
    let cleanupSuccess = true;

    // Reset state variables
    this._isUpdatingEquipment = false;
    this._abilityUpdatePromise = null;
    this._pendingAbilityUpdate = false;
    this._updatingAbilities = false;
    this.#equipmentUpdateInProgress = false;
    this.#pendingEquipmentUpdate = null;

    // Reset state variables
    this._isUpdatingEquipment = false;
    this._abilityUpdatePromise = null;
    this._pendingAbilityUpdate = false;
    this._updatingAbilities = false;
    this.#equipmentUpdateInProgress = false;
    this.#pendingEquipmentUpdate = null;

    // Clean up event listeners
    try {
      this.#listeners.forEach((events, element) => {
        if (!element) return;

        events.forEach((callbacks, type) => {
          callbacks.forEach((callback) => {
            try {
              element.removeEventListener(type, callback);
            } catch (error) {
              HM.log(2, `Failed to remove ${type} event listener:`, error);
              cleanupSuccess = false;
            }
          });
        });
      });
      this.#listeners.clear();
      HM.log(3, 'DOMManager: cleaned up all event listeners');
    } catch (error) {
      HM.log(1, 'Error during event listener cleanup:', error);
      cleanupSuccess = false;
    }

    // Clean up observers
    try {
      this.#observers.forEach((observer, id) => {
        try {
          observer.disconnect();
        } catch (error) {
          HM.log(2, `Failed to disconnect observer "${id}":`, error);
          cleanupSuccess = false;
        }
      });
      this.#observers.clear();
      HM.log(3, 'DOMManager: cleaned up all observers');
    } catch (error) {
      HM.log(1, 'Error during observer cleanup:', error);
      cleanupSuccess = false;
    }

    return cleanupSuccess;
  }

  /**
   * Initialize all event handlers for the application
   * @param {HTMLElement} element - Root element
   * @returns {Promise<boolean>} Success status
   */
  static async initialize(element) {
    if (!element) {
      HM.log(1, 'Cannot initialize DOMManager: No element provided');
      return false;
    }
    try {
      this.initializeEquipmentContainer(element);
      this.initializeDropdowns(element);
      this.initializeAbilities(element);
      this.initializeEquipment(element);
      this.initializeCharacterDetails(element);
      this.initializeFormValidation(element);
      this.initializeTokenCustomization(element);
      await this.initializeRollButtons(element);
      this.initializePortrait();
    } catch (error) {
      HM.log(1, 'Error during DOMManager initialization:', error);
      return false;
    }
  }

  /**
   * Initialize dropdown-related handlers
   * @param {HTMLElement} element - Application root element
   * @returns {Promise<void>}
   */
  static async initializeDropdowns(element) {
    const dropdownTypes = ['race', 'class', 'background'];
    const dropdowns = this.#getDropdownElements(element, dropdownTypes);

    // Process each dropdown type
    for (const [type, dropdown] of Object.entries(dropdowns)) {
      if (!dropdown) continue;

      this.on(dropdown, 'change', async (event) => {
        try {
          await this.#handleDropdownChange(element, type, event);
        } catch (error) {
          HM.log(1, `Error handling ${type} dropdown change:`, error);
        }
      });
    }
  }

  /**
   * Initialize ability score related handlers
   * @param {HTMLElement} element - Application root element
   * @returns {Promise<void>}
   */
  static initializeAbilities(element) {
    // Initialize roll method selector
    this.#initializeRollMethodSelector(element);

    // Initialize ability dropdowns
    this.#initializeAbilityDropdowns(element);

    // Initialize ability score inputs
    this.#initializeAbilityScoreInputs(element);

    // Initialize ability value tracking
    StatRoller.initializeAbilityDropdownTracking();
  }

  /**
   * Initialize equipment-related handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeEquipment(element) {
    const equipmentContainer = element.querySelector('#equipment-container');
    if (!equipmentContainer || HM.COMPAT.ELKAN) return;

    // Use mutation observer to catch dynamically added elements
    this.observe('equipment-container', equipmentContainer, { childList: true, subtree: true, attributes: true }, (mutations) => {
      let needsUpdate = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Add listeners to newly added checkboxes
              const newCheckboxes = node.querySelectorAll?.('.equipment-favorite-checkbox') || [];
              newCheckboxes.forEach((checkbox) => {
                this.on(checkbox, 'change', () => {
                  this.updateEquipmentSummary();
                });
              });

              // If we added elements that affect summary, flag for update
              if (node.querySelector('select') || node.querySelector('input[type="checkbox"]')) {
                needsUpdate = true;
              }
            }
          });
        }

        // If attribute changed on a favorite checkbox
        if (mutation.type === 'attributes' && mutation.attributeName === 'checked' && mutation.target.classList.contains('equipment-favorite-checkbox')) {
          needsUpdate = true;
        }
      }

      // Only update once if needed
      if (needsUpdate) {
        this.updateEquipmentSummary();
      }
    });

    // Attach listeners to existing equipment items
    this.attachEquipmentListeners(equipmentContainer);
  }

  /**
   * Initialize empty equipment container structure
   * @param {HTMLElement} element - Root element
   */
  static initializeEquipmentContainer(element) {
    const equipmentContainer = element.querySelector('#equipment-container');
    if (!equipmentContainer || HM.COMPAT.ELKAN) return;

    // Clear any existing content
    equipmentContainer.innerHTML = '';
    const choicesContainer = document.createElement('div');
    choicesContainer.className = 'equipment-choices';

    // Add choices container to equipment container
    equipmentContainer.appendChild(choicesContainer);
  }

  /**
   * Attach listeners to equipment elements
   * @param {HTMLElement} container - Equipment container
   */
  static attachEquipmentListeners(container) {
    if (!container) return;

    // Add change listeners to selects and checkboxes
    const selects = container.querySelectorAll('select');
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    selects.forEach((select) => {
      this.on(select, 'change', () => this.updateEquipmentSummary());
    });

    checkboxes.forEach((checkbox) => {
      this.on(checkbox, 'change', () => this.updateEquipmentSummary());
    });
  }

  /**
   * Initialize character detail handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeCharacterDetails(element) {
    // Character name input
    const nameInput = element.querySelector('#character-name');
    if (nameInput) {
      this.on(nameInput, 'input', () => this.updateTitle(element));
    }

    // Token art checkbox
    const tokenArtCheckbox = element.querySelector('#link-token-art');
    if (tokenArtCheckbox) {
      this.on(tokenArtCheckbox, 'change', () => {
        const tokenArtRow = element.querySelector('#token-art-row');
        if (tokenArtRow) {
          tokenArtRow.style.display = tokenArtCheckbox.checked ? 'none' : 'flex';
        }
      });
    }

    // Player dropdown (GM only)
    if (game.user.isGM) {
      const playerElement = element.querySelector('#player-assignment');
      if (playerElement) {
        this.on(playerElement, 'change', (event) => {
          const playerId = event.currentTarget.value;
          const colorPicker = element.querySelector('#player-color');
          if (colorPicker) {
            colorPicker.value = HeroMancer.ORIGINAL_PLAYER_COLORS.get(playerId);
          }
        });
      }
    }
  }

  /**
   * Initialize form validation handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeFormValidation(element) {
    const mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];
    if (mandatoryFields.length === 0) return;

    // Form elements
    const formElements = element.querySelectorAll('input, select, textarea, color-picker');
    formElements.forEach((formElement) => {
      // Change event
      this.on(formElement, 'change', async () => {
        FormValidation.checkMandatoryFields(element);
        FormValidation.checkMandatoryFields(element);
      });

      // Input event for text inputs
      if (formElement.tagName.toLowerCase() === 'input' || formElement.tagName.toLowerCase() === 'textarea') {
        this.on(formElement, 'input', async () => {
          FormValidation.checkMandatoryFields(element);
          FormValidation.checkMandatoryFields(element);
        });
      }
    });

    // ProseMirror editors
    const proseMirrorElements = element.querySelectorAll('prose-mirror');
    proseMirrorElements.forEach((editor, index) => {
      const editorContent = editor.querySelector('.editor-content.ProseMirror');
      if (editorContent) {
        this.observe(`prose-mirror-${index}`, editorContent, { childList: true, characterData: true, subtree: true }, async () => {
          FormValidation.checkMandatoryFields(element);
        });
      }
    });
  }

  /**
   * Initialize token customization handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeTokenCustomization(element) {
    const ringEnabled = game.settings.get(HM.ID, 'enableTokenCustomization');
    if (!ringEnabled) return;

    const ringEnabledElement = element.querySelector('input[name="ring.enabled"]');
    const ringOptions = element.querySelectorAll(
      ['.customization-row:has(color-picker[name="ring.color"])', '.customization-row:has(color-picker[name="backgroundColor"])', '.customization-row.ring-effects'].join(', ')
    );

    if (!ringEnabledElement || !ringOptions.length) return;

    // Initial state
    ringOptions.forEach((option) => {
      option.style.display = ringEnabledElement.checked ? 'flex' : 'none';
    });

    // Toggle on change
    this.on(ringEnabledElement, 'change', (event) => {
      if (!event.currentTarget.checked) {
        // Reset color pickers
        element.querySelectorAll('color-picker[name="ring.color"], color-picker[name="backgroundColor"]').forEach((picker) => {
          picker.value = '';
          picker.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Reset ring effect checkboxes
        element.querySelectorAll('input[name="ring.effects"]').forEach((checkbox) => {
          checkbox.checked = false;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }

      // Toggle visibility
      ringOptions.forEach((option) => {
        option.style.display = event.currentTarget.checked ? 'flex' : 'none';
      });
    });
  }

  /**
   * Initialize character portrait with default image
   * @static
   */
  static initializePortrait() {
    const portraitContainer = document.querySelector('.character-portrait');
    if (portraitContainer) {
      const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
      const randomAbility = abilities[Math.floor(Math.random() * 6)];
      const defaultImage = `systems/dnd5e/icons/svg/abilities/${randomAbility}.svg`;
      const portraitImg = portraitContainer.querySelector('img');

      if (portraitImg) {
        portraitImg.src = defaultImage;

        //V13 Compat - Setting reference changed.
        let versionCheck = foundry.utils.isNewerVersion(game.version, '12.343');
        let isDarkMode;
        if (versionCheck) {
          isDarkMode = game.settings?.get('core', 'uiConfig').colorScheme.applications;
        } else {
          isDarkMode = game.settings?.get('core', 'colorScheme') === 'dark';
        }
        this.applyDarkModeToImage(portraitImg, isDarkMode, true);
      }

      // Add name and art path update handling
      const nameInput = document.querySelector('#character-name');
      const artInput = document.querySelector('#character-art-path');
      const portraitName = document.querySelector('.header-section h2');

      const updatePortrait = () => {
        if (portraitName) {
          portraitName.innerHTML = nameInput?.value || game.user.name;
        }
        if (portraitImg && artInput) {
          const isDefaultImage = portraitImg.src.includes('/abilities/');
          portraitImg.src = artInput.value || defaultImage;

          //V13 Compat - Setting reference changed.
          let versionCheck = foundry.utils.isNewerVersion(game.version, '12.343');
          let isDarkMode;
          if (versionCheck) {
            isDarkMode = game.settings.get('core', 'uiConfig').colorScheme.applications;
          } else {
            isDarkMode = game.settings?.get('core', 'colorScheme') === 'dark';
          }

          const isStillDefaultImage = !artInput.value || artInput.value.includes('/abilities/');
          this.applyDarkModeToImage(portraitImg, isDarkMode, isStillDefaultImage);
        }
      };

      this.on(nameInput, 'change', updatePortrait);
      this.on(artInput, 'change', updatePortrait);
      updatePortrait();

      // Listen for color scheme changes
      Hooks.on('colorSchemeChange', (scheme) => {
        if (portraitImg) {
          const isDefaultImage = portraitImg.src.includes('/abilities/');
          this.applyDarkModeToImage(portraitImg, scheme === 'dark', isDefaultImage);
        }
      });
    }
  }

  /**
   * Helper method to apply or remove dark mode treatment to images
   * @param {HTMLImageElement} imgElement - The image element
   * @param {boolean} isDarkMode - Whether dark mode is active
   * @param {boolean} isDefaultImage - Whether the image is a default ability icon
   */
  static applyDarkModeToImage(imgElement, isDarkMode, isDefaultImage) {
    if (isDarkMode && isDefaultImage) {
      imgElement.style.filter = 'invert(1)';
    } else {
      imgElement.style.filter = 'none';
    }
  }

  /**
   * Initialize roll buttons for background characteristics
   * @param {HTMLElement} element - Application root element
   */
  static async initializeRollButtons() {
    const rollButtons = document.querySelectorAll('.roll-btn');
    const backgroundSelect = document.querySelector('#background-dropdown');

    // Batch disable all buttons initially
    if (rollButtons.length) {
      requestAnimationFrame(() => {
        rollButtons.forEach((button) => (button.disabled = true));
      });
    }

    backgroundSelect?.addEventListener('change', (event) => {
      const backgroundId = event.target.value.split(' (')[0];

      // Batch button updates
      requestAnimationFrame(() => {
        rollButtons.forEach((button) => (button.disabled = !backgroundId));
      });
    });

    rollButtons.forEach((button) => {
      button.addEventListener('click', async (event) => {
        const tableType = event.currentTarget.dataset.table;
        const textarea = event.currentTarget.closest('.input-with-roll').querySelector('textarea');
        const backgroundId = HM.SELECTED.background.id;

        if (!backgroundId) {
          ui.notifications.warn(game.i18n.localize('hm.warnings.select-background'));
          return;
        }

        const result = await TableManager.rollOnBackgroundCharacteristicTable(backgroundId, tableType);
        HM.log(3, 'Roll result:', result);

        if (result) {
          textarea.value = textarea.value ? `${textarea.value} ${result}` : result;
          textarea.dispatchEvent(new Event('change', { bubbles: true }));

          if (TableManager.areAllTableResultsDrawn(backgroundId, tableType)) {
            button.disabled = true;
          }
        }
      });
    });
  }

  /**
   * Updates the background summary text and formatting
   * @returns {Promise<void>}
   * @static
   */
  static async updateBackgroundSummary() {
    const summary = document.querySelector('.background-summary');
    if (!summary) return;

    try {
      const backgroundData = this.#getBackgroundData();

      // Format and update summary
      const content = game.i18n.format('hm.app.finalize.summary.background', {
        article: backgroundData.article,
        background: backgroundData.link
      });

      summary.innerHTML = await TextEditor.enrichHTML(content);
    } catch (error) {
      HM.log(1, 'Error updating background summary:', error);

      // Fallback content
      const fallbackContent = game.i18n.format('hm.app.finalize.summary.background', {
        article: game.i18n.localize('hm.app.equipment.article-plural'),
        background: game.i18n.localize('hm.app.background.adventurer')
      });

      summary.innerHTML = fallbackContent;
    }
  }

  /**
   * Updates the class and race summary text
   * @returns {Promise<void>}
   * @static
   */
  static async updateClassRaceSummary() {
    const summary = document.querySelector('.class-race-summary');
    if (!summary) return;

    try {
      // Get race and class links
      const raceLink = this.#getRaceLink();
      const classLink = this.#getClassLink();

      // Update summary with enriched HTML
      const content = game.i18n.format('hm.app.finalize.summary.classRace', {
        race: raceLink,
        class: classLink
      });

      summary.innerHTML = await TextEditor.enrichHTML(content);
    } catch (error) {
      HM.log(1, 'Error updating class/race summary:', error);

      // Fallback content
      const fallbackContent = game.i18n.format('hm.app.finalize.summary.classRace', {
        race: game.i18n.format('hm.unknown', { type: 'race' }),
        class: game.i18n.format('hm.unknown', { type: 'class' })
      });

      summary.innerHTML = await TextEditor.enrichHTML(fallbackContent);
    }
  }

  /**
   * Updates the equipment summary with selected items
   * @returns {void}
   * @static
   */
  static updateEquipmentSummary() {
    // Check if we're already processing an update
    if (this._isUpdatingEquipment) return;
    this._isUpdatingEquipment = true;

    try {
      const summary = document.querySelector('.equipment-summary');
      if (!summary) return;

      // If in ELKAN mode or no container, use default message
      const equipmentContainer = document.querySelector('#equipment-container');
      if (!equipmentContainer || HM.COMPAT.ELKAN) {
        summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
        return;
      }

      // Collect and process equipment
      const selectedEquipment = this.#collectEquipmentItems();

      if (!selectedEquipment.length) {
        summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
        return;
      }

      // Format and display equipment summary
      this.#formatAndDisplayEquipmentSummary(summary, selectedEquipment);
    } catch (error) {
      HM.log(1, 'Error updating equipment summary:', error);

      // Fallback to default message on error
      const summary = document.querySelector('.equipment-summary');
      if (summary) {
        summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
      }
    } finally {
      // Release the lock when done
      this._isUpdatingEquipment = false;
    }
  }

  /**
   * Updates the abilities summary based on class preferences and highest scores
   * @returns {Promise<void>}
   * @static
   */
  static async updateAbilitiesSummary() {
    // Store current class UUID for comparison
    const currentClassUUID = HM.SELECTED.class?.uuid;

    // Don't use a simple flag - we need a more robust approach
    if (this._abilityUpdatePromise) {
      // Store that we need another update after this one finishes
      this._pendingAbilityUpdate = true;
      return;
    }

    try {
      // Create a new update promise
      this._abilityUpdatePromise = (async () => {
        // Add a small delay to ensure the class selection is fully processed
        new Promise((resolve) => setTimeout(resolve, 10));

        // First, ensure the class UUID hasn't changed during our delay
        if (currentClassUUID !== HM.SELECTED.class?.uuid) {
          return; // Another update will happen
        }

        if (this._updatingAbilities) return;
        this._updatingAbilities = true;

        try {
          this.#processAbilityHighlights();
          this.#updateAbilitySummaryContent();
        } catch (error) {
          HM.log(1, 'Error updating abilities summary:', error);
        } finally {
          setTimeout(() => (this._updatingAbilities = false), 50);
        }
      })();
      await this._abilityUpdatePromise;
    } finally {
      // Clear the promise reference
      this._abilityUpdatePromise = null;

      // If another update was requested while we were processing
      if (this._pendingAbilityUpdate) {
        this._pendingAbilityUpdate = false;
        // Request another update
        requestAnimationFrame(() => this.updateAbilitiesSummary());
      }
    }
  }

  /**
   * Updates the character size field based on race advancements
   * @param {string} raceUuid UUID of the selected race
   * @static
   */
  static async updateRaceSize(raceUuid) {
    try {
      if (!raceUuid) {
        HM.log(3, 'No race UUID provided for size update');
        return;
      }

      // Find size input
      const sizeInput = document.getElementById('size');
      if (!sizeInput) {
        HM.log(2, 'Could not find size input element');
        return;
      }

      // Get race document
      const race = await fromUuidSync(raceUuid);
      if (!race) {
        HM.log(2, `Could not find race with UUID: ${raceUuid}`);
        sizeInput.value = '';
        sizeInput.placeholder = game.i18n.localize('hm.app.biography.size-placeholder');
        return;
      }

      // Log the race and its advancement structure for debugging
      HM.log(3, `Processing race: ${race.name}`, race);

      // Look for size advancement - handle different data structures
      let sizesArray = [];
      let hint = '';

      // Check for size advancement using more detailed property access
      if (race.advancement?.byType?.Size?.length) {
        const sizeAdvancement = race.advancement.byType.Size[0];
        HM.log(3, 'Found Size advancement:', sizeAdvancement);

        // Handle Set vs Array - check if sizes exists and convert if needed
        if (sizeAdvancement.configuration?.sizes) {
          // If it's a Set, convert to array
          if (sizeAdvancement.configuration.sizes instanceof Set) {
            sizesArray = Array.from(sizeAdvancement.configuration.sizes);
            HM.log(3, `Converted sizes Set to Array: ${sizesArray.join(', ')}`);
          }
          // If it's already an array
          else if (Array.isArray(sizeAdvancement.configuration.sizes)) {
            sizesArray = sizeAdvancement.configuration.sizes;
          }

          hint = sizeAdvancement.hint || '';
        }
      }

      // If no size found, clear the field
      if (!sizesArray.length) {
        HM.log(2, `No size advancement found for race: ${race.name}`, { advancement: race.advancement });
        sizeInput.value = '';
        sizeInput.placeholder = game.i18n.localize('hm.app.biography.size-placeholder');
        return;
      }

      // Format size names
      const sizeLabels = sizesArray.map((size) => {
        return CONFIG.DND5E.actorSizes[size]?.label || size;
      });
      HM.log(3, `Size labels for ${race.name}: ${sizeLabels.join(', ')}`);

      // Format based on number of sizes
      let sizeText = '';
      if (sizeLabels.length === 1) {
        sizeText = sizeLabels[0];
      } else if (sizeLabels.length === 2) {
        sizeText = `${sizeLabels[0]} or ${sizeLabels[1]}`;
      } else if (sizeLabels.length > 2) {
        const lastLabel = sizeLabels.pop();
        sizeText = `${sizeLabels.join(', ')}, or ${lastLabel}`;
      }

      // Update input field
      sizeInput.value = sizeText;
      HM.log(3, `Updated size input with value: "${sizeText}"`);

      // Add hint as title if available
      if (hint) {
        sizeInput.title = hint;
        HM.log(3, `Added size hint from race: "${hint}"`);
      }
    } catch (error) {
      HM.log(1, `Error updating race size: ${error.message}`, error);
      const sizeInput = document.getElementById('size');
      if (sizeInput) {
        sizeInput.value = '';
        sizeInput.placeholder = game.i18n.localize('hm.app.biography.size-placeholder');
      }
    }
  }

  /**
   * Process background selection changes to load relevant tables
   * @param {object} selectedBackground - Selected background data
   * @static
   */
  static async processBackgroundSelectionChange(selectedBackground) {
    if (!selectedBackground?.value) {
      return;
    }

    const uuid = HM.SELECTED.background.uuid;

    try {
      const background = await fromUuidSync(uuid);
      if (background) {
        TableManager.loadRollTablesForBackground(background);

        const rollButtons = document.querySelectorAll('.roll-btn');
        rollButtons.forEach((button) => (button.disabled = false));
      }
    } catch (error) {
      HM.log(1, `Error loading background with UUID ${uuid}:`, error);
    }
  }

  /**
   * Generates a formatted chat message summarizing the created character
   * @param {object} actor - Current actor data to derive chat details from
   * @returns {string} HTML content for chat message
   * @static
   */
  static generateCharacterSummaryChatMessage(actor) {
    try {
      // Get character name and summary sections
      const characterName = this.#getCharacterName();
      const summaries = this.#collectSummaryContent();

      // Generate formatted HTML message
      return this.#buildSummaryMessageHTML(characterName, summaries, actor);
    } catch (error) {
      HM.log(1, 'Error generating character summary message:', error);

      // Return basic fallback message on error
      const fallbackName = document.querySelector('#character-name')?.value || game.user.name;
      return `<div class="character-summary"><h2>${fallbackName}</h2><p>${game.i18n.localize('hm.app.character-created')}</p></div>`;
    }
  }

  /**
   * Updates tab indicators based on mandatory field completion
   * @param {HTMLElement} form - The form element
   * @returns {void}
   * @static
   */
  static updateTabIndicators(form) {
    try {
      if (!form) return;

      // Skip if no mandatory fields configured
      const mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];
      if (!mandatoryFields.length) return;

      // Get all tab elements
      const tabs = form.querySelectorAll('.hero-mancer-tabs a.item');
      if (!tabs.length) return;

      // Process operations in batches to reduce reflow
      const operations = [];

      // Check each tab
      for (const tab of tabs) {
        const tabId = tab.dataset.tab;
        if (!tabId) continue;

        // Check for incomplete mandatory fields
        const hasIncompleteFields = FormValidation.hasIncompleteTabFields(tabId, form);

        // Get or create indicator
        let indicator = tab.querySelector('.tab-mandatory-indicator');

        if (hasIncompleteFields) {
          // Add indicator if needed
          if (!indicator) {
            operations.push(() => {
              indicator = document.createElement('i');
              indicator.className = 'fa-solid fa-triangle-exclamation tab-mandatory-indicator';
              indicator.className = 'fa-solid fa-triangle-exclamation tab-mandatory-indicator';

              // Find the icon element to position relative to
              const iconElement = tab.querySelector('i:not(.tab-mandatory-indicator)');
              if (iconElement) {
                // Check if icon already has an indicator before adding a new one
                if (!iconElement.querySelector('.tab-mandatory-indicator')) {
                  // Position relative to the icon
                  iconElement.style.position = 'relative';
                  iconElement.appendChild(indicator);
                }
              } else if (!tab.querySelector('.tab-mandatory-indicator')) {
                tab.appendChild(indicator);
              }
            });
          }
        } else if (indicator) {
          // Remove indicator
          operations.push(() => indicator.remove());
        }
      }

      // Execute all DOM operations at once
      if (operations.length > 0) {
        requestAnimationFrame(() => operations.forEach((op) => op()));
      }
    } catch (error) {
      HM.log(1, `Error updating tab indicators: ${error.message}`);
    }
  }

  /**
   * Restores saved form options to DOM elements
   * @param {HTMLElement} html - The form container element
   */
  static async restoreFormOptions(html) {
    const savedOptions = await SavedOptions.loadOptions();

    if (Object.keys(savedOptions).length === 0) return;

    for (const [key, value] of Object.entries(savedOptions)) {
      const selector = `[name="${key}"]`;

      const elem = html.querySelector(selector);

      if (!elem) continue;

      if (elem.type === 'checkbox') {
        elem.checked = value;
      } else if (elem.tagName === 'SELECT') {
        elem.value = value;
        elem.dispatchEvent(new Event('change'));
        this.updateClassRaceSummary();
      } else {
        elem.value = value;
      }
    }
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Update description element with content
   * @param {string} type - Type of dropdown (class, race, background)
   * @param {string} id - ID of selected item
   * @param {HTMLElement} descriptionEl - Description element to update
   * @returns {Promise<void>}
   * @static
   */
  static async updateDescription(type, id, descriptionEl) {
    if (!descriptionEl) {
      HM.log(2, `Cannot update ${type} description: No description element provided`);
      return;
    }

    HM.log(3, `Updating ${type} description for ID: ${id}`);

    try {
      // If no ID provided, clear the description
      if (!id) {
        descriptionEl.innerHTML = '';
        return;
      }

      // Find the document
      const doc = await this.#findDocumentById(type, id);

      // No document found
      if (!doc) {
        descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
        return;
      }

      // Check for journal page - render it if available
      if (doc.journalPageId) {
        await this.#renderJournalPage(doc, descriptionEl);
        return;
      }

      // Fall back to regular description
      this.#renderStandardDescription(doc, descriptionEl);
    } catch (error) {
      HM.log(1, `Error updating ${type} description: ${error.message}`, error);
      descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
    }
  }

  /**
   * Update equipment UI based on changed selections
   * @param {HTMLElement} element - Application root element
   * @param {string} type - Which selection changed ('class' or 'background')
   */
  static updateEquipment(element, type) {
    const equipmentContainer = element.querySelector('#equipment-container');
    if (!equipmentContainer) return Promise.resolve();

    // If update already in progress, queue this one
    if (this.#equipmentUpdateInProgress) {
      return new Promise((resolve) => {
        this.#pendingEquipmentUpdate = { element, type, resolve };
      });
    }

    this.#equipmentUpdateInProgress = true;

    // Create and return the promise without using async in the executor
    return new Promise((resolve) => {
      // Reset the render tracking
      EquipmentParser.renderedItems = new Set();

      if (EquipmentParser.lookupItems) {
        Object.values(EquipmentParser.lookupItems).forEach((category) => {
          if (category.items?.forEach) {
            category.items.forEach((item) => {
              delete item.rendered;
              delete item.isSpecialCase;
              delete item.specialGrouping;
            });
          }
        });
      }

      // Use the promise chain approach instead
      const equipment = EquipmentParser.getInstance();
      equipment
        .generateEquipmentSelectionUI(type)
        .then(() => {
          this.attachEquipmentListeners(equipmentContainer);
        })
        .catch((error) => {
          HM.log(1, `Error in updateEquipment for ${type}:`, error);
        })
        .finally(() => {
          this.#equipmentUpdateInProgress = false;
          resolve();

          // Process any pending update
          if (this.#pendingEquipmentUpdate) {
            const { element, type, resolve: pendingResolve } = this.#pendingEquipmentUpdate;
            this.#pendingEquipmentUpdate = null;
            this.updateEquipment(element, type).then(pendingResolve);
          }
        });
    });
  }

  /**
   * Update application title based on form state
   * @param {HTMLElement} element - Application root element
   */
  static updateTitle(element) {
    if (!HM.heroMancer) return;

    // Get character name or default to user name
    const characterNameInput = element.querySelector('#character-name');
    const characterName = characterNameInput?.value?.trim() || game.user.name;

    // Character description components
    let race = '';
    let background = '';
    let charClass = '';

    // Get document names from UUIDs
    try {
      if (HM.SELECTED.race?.uuid) {
        const raceDoc = fromUuidSync(HM.SELECTED.race.uuid);
        race = raceDoc?.name || '';
      }

      if (HM.SELECTED.class?.uuid) {
        const classDoc = fromUuidSync(HM.SELECTED.class.uuid);
        charClass = classDoc?.name || '';
      }

      if (HM.SELECTED.background?.uuid) {
        const backgroundDoc = fromUuidSync(HM.SELECTED.background.uuid);
        background = backgroundDoc?.name || '';
      }
    } catch (error) {
      HM.log(2, `Error getting document: ${error}`);
    }

    let characterDescription = characterName;
    const components = [race, background, charClass].filter((c) => c);

    if (components.length > 0) {
      characterDescription += `, ${game.i18n.format('hm.app.title', { components: components.join(' ') })}`;
      characterDescription += '.';
    }

    const newTitle = `${HM.NAME} | ${characterDescription}`;

    HM.heroMancer._updateFrame({
      window: {
        title: newTitle
      }
    });
  }

  /**
   * Updates the display of remaining points in the abilities tab
   * @param {number} remainingPoints - The number of points remaining to spend
   * @static
   */
  static updateRemainingPointsDisplay(remainingPoints) {
    const abilitiesTab = document.querySelector(".tab[data-tab='abilities']");
    if (!abilitiesTab?.classList.contains('active')) return;

    const remainingPointsElement = document.getElementById('remaining-points');
    const totalPoints = StatRoller.getTotalPoints();

    if (remainingPointsElement) {
      remainingPointsElement.innerHTML = remainingPoints;
      this.#updatePointsColor(remainingPointsElement, remainingPoints, totalPoints);
    }
  }

  /**
   * Adjusts ability score up or down within valid range and point limits
   * @param {number} index - The index of the ability score to adjust
   * @param {number} change - The amount to change the score by (positive or negative)
   * @param {number[]} selectedAbilities - Array of current ability scores
   * @static
   */
  static changeAbilityScoreValue(index, change, selectedAbilities) {
    if (!Array.isArray(selectedAbilities)) {
      HM.log(1, 'selectedAbilities must be an array');
      return;
    }
    const abilityScoreElement = document.getElementById(`ability-score-${index}`);
    const currentScore = parseInt(abilityScoreElement.innerHTML, 10);
    const { MIN, MAX } = HM.ABILITY_SCORES;
    const newScore = Math.min(MAX, Math.max(MIN, currentScore + change));
    const totalPoints = StatRoller.getTotalPoints();
    const pointsSpent = StatRoller.calculateTotalPointsSpent(selectedAbilities);

    if (change > 0 && pointsSpent + StatRoller.getPointBuyCostForScore(newScore) - StatRoller.getPointBuyCostForScore(currentScore) > totalPoints) {
      HM.log(2, 'Not enough points remaining to increase this score.');
      return;
    }

    if (newScore !== currentScore) {
      abilityScoreElement.innerHTML = newScore;
      selectedAbilities[index] = newScore;

      const updatedPointsSpent = StatRoller.calculateTotalPointsSpent(selectedAbilities);
      const remainingPoints = totalPoints - updatedPointsSpent;

      this.updateRemainingPointsDisplay(remainingPoints);
      this.updatePlusButtonState(selectedAbilities, remainingPoints);
      this.updateMinusButtonState(selectedAbilities);
    }
  }

  /**
   * Updates the state of plus buttons based on available points and maximum scores
   * @param {number[]} selectedAbilities - Array of current ability scores
   * @param {number} remainingPoints - Points available to spend
   * @static
   */
  static updatePlusButtonState(selectedAbilities, remainingPoints) {
    // Create a document fragment for batch processing
    const updates = [];
    const { MAX } = HM.ABILITY_SCORES;

    document.querySelectorAll('.plus-button').forEach((button, index) => {
      const currentScore = selectedAbilities[index];
      const pointCostForNextIncrease = StatRoller.getPointBuyCostForScore(currentScore + 1) - StatRoller.getPointBuyCostForScore(currentScore);
      const shouldDisable = currentScore >= MAX || remainingPoints < pointCostForNextIncrease;

      // Only update if the state actually changes
      if (button.disabled !== shouldDisable) {
        updates.push(() => (button.disabled = shouldDisable));
      }

      const inputElement = document.getElementById(`ability-${index}-input`);
      if (inputElement && inputElement.value !== String(currentScore)) {
        updates.push(() => (inputElement.value = currentScore));
      }
    });

    // Apply all updates in one batch
    if (updates.length) {
      requestAnimationFrame(() => updates.forEach((update) => update()));
    }
  }

  /**
   * Updates the state of minus buttons based on minimum allowed scores
   * @param {number[]} selectedAbilities - Array of current ability scores
   * @static
   */
  static updateMinusButtonState(selectedAbilities) {
    const updates = [];
    const { MIN } = HM.ABILITY_SCORES;

    document.querySelectorAll('.minus-button').forEach((button, index) => {
      const currentScore = selectedAbilities[index];
      const shouldDisable = currentScore <= MIN;

      // Only update if the state actually changes
      if (button.disabled !== shouldDisable) {
        updates.push(() => (button.disabled = shouldDisable));
      }

      const inputElement = document.getElementById(`ability-${index}-input`);
      if (inputElement && inputElement.value !== String(currentScore)) {
        updates.push(() => (inputElement.value = currentScore));
      }
    });

    // Apply all updates in one batch
    if (updates.length) {
      requestAnimationFrame(() => updates.forEach((update) => update()));
    }
  }

  /**
   * Updates the visual state of ability dropdowns based on selected values
   * Updates the visual state of ability dropdowns based on selected values
   * @param {NodeList} abilityDropdowns - Ability dropdown elements
   * @param {string[]} selectedValues - Currently selected values
   * @static
   */
  static updateAbilityDropdownsVisualState(abilityDropdowns, selectedValues) {
    // Count value occurrences in the standard array
    const valueOccurrences = {};
    if (abilityDropdowns.length > 0) {
      const firstDropdown = abilityDropdowns[0];
      Array.from(firstDropdown.options).forEach((option) => {
        if (option.value) {
          valueOccurrences[option.value] = (valueOccurrences[option.value] || 0) + 1;
        }
      });
    }

    // Count current selections of each value
    const selectedCounts = {};
    selectedValues.forEach((value) => {
      if (!value) return;
      selectedCounts[value] = (selectedCounts[value] || 0) + 1;
    });

    // Update options to show used values
    abilityDropdowns.forEach((dropdown, dropdownIndex) => {
      Array.from(dropdown.options).forEach((option) => {
        // Always ensure no disabling
        option.disabled = false;

        // Remove existing class first
        option.classList.remove('hm-used-elsewhere');

        // Skip empty option
        if (!option.value) return;

        // Get the value and its occurrences
        const value = option.value;
        const maxOccurrences = valueOccurrences[value] || 0;
        const selectedCount = selectedCounts[value] || 0;

        // Only mark as "used elsewhere" if all available instances are used
        // AND this dropdown isn't showing one of those instances
        const isUsedUp = selectedCount >= maxOccurrences;
        const isSelectedHere = dropdown.value === value;

        if (isUsedUp && !isSelectedHere) {
          option.classList.add('hm-used-elsewhere');
        }
      });
    });
  }

  /**
   * Updates the character review tab with data from all previous tabs
   * @returns {Promise<void>}
   * Updates the character review tab with data from all previous tabs
   * @returns {Promise<void>}
   * @static
   */
  static async updateReviewTab() {
    try {
      // Get the finalize tab
      const finalizeTab = document.querySelector('.tab[data-tab="finalize"]');
      if (!finalizeTab) {
        HM.log(2, 'Finalize tab not found');
        return;
      }

      // Get the review sections using the correct selectors
      const basicInfoSection = finalizeTab.querySelector('.review-section[aria-labelledby="basic-info-heading"] .review-content');
      const abilitiesSection = finalizeTab.querySelector('.review-section[aria-labelledby="abilities-heading"] .abilities-grid');
      const equipmentSection = finalizeTab.querySelector('.review-section[aria-labelledby="equipment-heading"] .equipment-list');
      const bioSection = finalizeTab.querySelector('.review-section[aria-labelledby="biography-heading"] .bio-preview');
      const proficienciesSection = finalizeTab.querySelector('.review-section[aria-labelledby="proficiencies-heading"] .proficiencies-list');

      if (!basicInfoSection || !abilitiesSection || !equipmentSection || !bioSection) {
        HM.log(2, 'Could not find all required review sections');
        HM.log(
          3,
          `Sections found:
        Basic Info: ${basicInfoSection ? 'Yes' : 'No'}
        Abilities: ${abilitiesSection ? 'Yes' : 'No'}
        Equipment: ${equipmentSection ? 'Yes' : 'No'}
        Bio: ${bioSection ? 'Yes' : 'No'}
        Proficiencies: ${proficienciesSection ? 'Yes' : 'No'}`
        );
        return;
      }

      // Update each section
      await this.#updateBasicInfoReview(basicInfoSection);
      await this.#updateAbilitiesReview(abilitiesSection);
      await this.#updateEquipmentReview(equipmentSection);
      await this.#updateBiographyReview(bioSection);

      // Update proficiencies section if it exists
      if (proficienciesSection) {
        await this.#updateProficienciesReview(proficienciesSection);
      }
    } catch (error) {
      HM.log(1, 'Error updating review tab:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Private Methods                             */
  /* -------------------------------------------- */

  /**
   * Updates the color of the remaining points display based on percentage remaining
   * @param {HTMLElement} element - The element to update
   * @param {number} remainingPoints - Current remaining points
   * @param {number} totalPoints - Total available points
   * @private
   * @static
   */
  static #updatePointsColor(element, remainingPoints, totalPoints) {
    if (!element) return;

    const percentage = (remainingPoints / totalPoints) * 100;
    const hue = Math.max(0, Math.min(120, (percentage * 120) / 100));
    element.style.color = `hsl(${hue}, 100%, 35%)`;
  }

  /**
   * Get dropdown elements for specified types
   * @param {HTMLElement} element - Root element
   * @param {string[]} types - Dropdown types to find
   * @returns {Object} Map of dropdown elements by type
   * @private
   */
  static #getDropdownElements(element, types) {
    const dropdowns = {};

    for (const type of types) {
      const selector = `#${type}-dropdown`;
      dropdowns[type] = element.querySelector(selector);

      if (!dropdowns[type]) {
        HM.log(2, `${type} dropdown not found`);
      }
    }

    return dropdowns;
  }

  /**
   * Handle dropdown change event
   * @param {HTMLElement} element - Root element
   * @param {string} type - Dropdown type
   * @param {Event} event - Change event
   * @private
   */
  static async #handleDropdownChange(element, type, event) {
    // Extract selection data
    const value = event.target.value;

    // Check if default/empty option is selected
    if (!value) {
      // Reset selection data for this type
      HM.SELECTED[type] = { value: '', id: '', uuid: '' };
      HM.log(3, `${type} reset to default`);

      // Find the correct tab
      const currentTab = element.querySelector(`.tab[data-tab="${type}"]`);
      if (!currentTab) {
        HM.log(1, `Could not find tab for ${type}`);
        return;
      }

      // Find and clear the journal container
      const journalContainer = currentTab.querySelector('.journal-container');
      if (journalContainer) {
        journalContainer.innerHTML = '';
        journalContainer.removeAttribute('data-journal-id');
      }

      // Update UI based on dropdown type
      await this.#updateUIForDropdownType(element, type);
      return;
    }

    // Process selected option (existing code)
    const id = value.split(' ')[0].trim();
    const uuid = value.match(/\[(.*?)]/)?.[1] || '';

    // Update selected data
    HM.SELECTED[type] = { value, id, uuid };
    HM.log(3, `${type} updated:`, HM.SELECTED[type]);

    // Find the correct tab
    const currentTab = element.querySelector(`.tab[data-tab="${type}"]`);
    if (!currentTab) {
      HM.log(1, `Could not find tab for ${type}`);
      return;
    }

    // Find the journal container
    const journalContainer = currentTab.querySelector('.journal-container');
    if (journalContainer) {
      // Find the document with this ID
      let doc = null;
      if (type === 'race') {
        for (const folder of HM.documents.race) {
          const foundDoc = folder.docs.find((d) => d.id === id);
          if (foundDoc) {
            doc = foundDoc;
            break;
          }
        }
      } else {
        const docsArray = HM.documents[type] || [];
        doc = docsArray.find((d) => d.id === id);
      }

      if (doc) {
        if (doc.journalPageId) {
          // Set the journal ID and initialize the journal embed
          journalContainer.dataset.journalId = doc.journalPageId;

          // Get the item name from the dropdown selected text
          const itemName = event.target.options[event.target.selectedIndex].text.split(' (')[0];

          // Create and initialize the journal embed with the item name
          const embed = new JournalPageEmbed(journalContainer);
          await embed.render(doc.journalPageId, itemName);
        } else {
          // No journal, use fallback description but keep data attribute
          journalContainer.dataset.journalId = `fallback-${doc.id || 'description'}`;
          journalContainer.innerHTML = doc.enrichedDescription || game.i18n.localize('hm.app.no-description');
        }
      } else {
        journalContainer.removeAttribute('data-journal-id');
        journalContainer.innerHTML = game.i18n.localize('hm.app.no-description');
      }
    } else {
      HM.log(1, `Could not find journal container for ${type}`);
    }

    // Update UI based on dropdown type
    await this.#updateUIForDropdownType(element, type);

    if (type === 'race' && uuid) {
      await this.updateRaceSize(uuid);
    }

    if (type === 'race' && uuid) {
      await this.updateRaceSize(uuid);
    }
  }

  /**
   * Update UI components based on dropdown type
   * @param {HTMLElement} element - Root element
   * @param {string} type - Dropdown type
   * @private
   */
  static async #updateUIForDropdownType(element, type) {
    // Update summaries based on type
    if (type === 'race' || type === 'class') {
      this.updateClassRaceSummary();

      // Update abilities if class changes
      if (type === 'class') {
        this.updateAbilitiesSummary();
      }
    }

    if (type === 'background') {
      this.updateBackgroundSummary();
      await this.processBackgroundSelectionChange(HM.SELECTED.background);
    }

    // Update equipment if needed
    if (!HM.COMPAT.ELKAN && (type === 'class' || type === 'background')) {
      this.updateEquipment(element, type);
    }

    // Update application title
    this.updateTitle(element);
  }

  /**
   * Initialize roll method selector
   * @param {HTMLElement} element - Root element
   * @private
   */
  static #initializeRollMethodSelector(element) {
    const rollMethodSelect = element.querySelector('#roll-method');
    if (!rollMethodSelect) return;

    // First, remove any existing listeners to avoid duplicates
    const oldListeners = this.#listeners.get(rollMethodSelect);
    if (oldListeners?.get('change')) {
      oldListeners.get('change').forEach((callback) => {
        rollMethodSelect.removeEventListener('change', callback);
      });
      oldListeners.delete('change');
    }

    this.on(rollMethodSelect, 'change', async (event) => {
      const method = event.target.value;
      HM.log(3, `Roll method changed to: ${method}`);

      this.#handleRollMethodChange(element, method);
    });
  }

  /**
   * Handle roll method change
   * @param {HTMLElement} element - Root element
   * @param {string} method - Selected roll method
   * @private
   */
  static #handleRollMethodChange(element, method) {
    // Update the setting
    game.settings.set(HM.ID, 'diceRollingMethod', method);

    // Reset abilities
    HeroMancer.selectedAbilities = Array(Object.keys(CONFIG.DND5E.abilities).length).fill(HM.ABILITY_SCORES.DEFAULT);

    // Force a re-render of just the abilities tab
    const app = HM.heroMancer;
    if (app) {
      // Store current method for detection
      element.dataset.lastRollMethod = method;
      app.render({ parts: ['abilities'] });
    }
  }

  /**
   * Initialize ability dropdowns
   * @param {HTMLElement} element - Root element
   * @private
   */
  static #initializeAbilityDropdowns(element) {
    const abilityDropdowns = element.querySelectorAll('.ability-dropdown');

    abilityDropdowns.forEach((dropdown, index) => {
      // Add data-index attribute for reliable reference
      dropdown.dataset.index = index;

      this.on(dropdown, 'change', (event) => {
        const diceRollingMethod = game.settings.get(HM.ID, 'diceRollingMethod');
        StatRoller.handleAbilityDropdownChange(event, diceRollingMethod);
        this.updateAbilitiesSummary();
      });
    });
  }

  /**
   * Initialize ability score inputs
   * @param {HTMLElement} element - Root element
   * @private
   */
  static #initializeAbilityScoreInputs(element) {
    const abilityScores = element.querySelectorAll('.ability-score');

    abilityScores.forEach((input) => {
      const update = foundry.utils.debounce(() => this.updateAbilitiesSummary(), 100);
      this.on(input, 'change', update);
      this.on(input, 'input', update);
    });
  }

  /**
   * Get formatted race link for summary
   * @returns {string} Formatted race link or placeholder
   * @private
   */
  static #getRaceLink() {
    if (!HM.SELECTED.race?.uuid) {
      return game.i18n.format('hm.unknown', { type: 'race' });
    }

    const raceSelect = document.querySelector('#race-dropdown');
    let raceName = null;

    // Try to get race name from selected option
    if (raceSelect?.selectedIndex > 0) {
      raceName = raceSelect.options[raceSelect.selectedIndex].text;
    } else if (raceSelect) {
      // Find matching option by UUID
      for (let i = 0; i < raceSelect.options.length; i++) {
        if (raceSelect.options[i].value.includes(HM.SELECTED.race.uuid)) {
          raceName = raceSelect.options[i].text;
          break;
        }
      }
    }

    if (raceName) {
      return `@UUID[${HM.SELECTED.race.uuid}]`;
    }

    // Fallback to retrieving from UUID directly
    try {
      return `@UUID[${HM.SELECTED.race.uuid}]`;
    } catch (error) {
      HM.log(2, `Failed to resolve race UUID: ${HM.SELECTED.race.uuid}`, error);
      return game.i18n.format('hm.unknown', { type: 'race' });
    }
  }

  /**
   * Get formatted class link for summary
   * @returns {string} Formatted class link or placeholder
   * @private
   */
  static #getClassLink() {
    if (!HM.SELECTED.class?.uuid) {
      return game.i18n.format('hm.unknown', { type: 'class' });
    }

    const classSelect = document.querySelector('#class-dropdown');

    // Try to get class name from dropdown
    if (classSelect?.selectedIndex > 0) {
      return `@UUID[${HM.SELECTED.class.uuid}]`;
    }

    // Fallback to retrieving from UUID directly
    try {
      return `@UUID[${HM.SELECTED.class.uuid}]`;
    } catch (error) {
      HM.log(2, `Failed to resolve class UUID: ${HM.SELECTED.class.uuid}`, error);
      return game.i18n.format('hm.unknown', { type: 'class' });
    }
  }

  /**
   * Get background data for summary
   * @returns {Object} Background data including article and link
   * @private
   */
  static #getBackgroundData() {
    const backgroundSelect = document.querySelector('#background-dropdown');
    const selectedOption = backgroundSelect?.selectedIndex > 0 ? backgroundSelect.options[backgroundSelect.selectedIndex] : null;

    // Handle default/no selection case
    if (!selectedOption?.value || !HM.SELECTED.background?.uuid) {
      return {
        article: game.i18n.localize('hm.app.equipment.article-plural'),
        link: game.i18n.localize('hm.app.background.adventurer')
      };
    }

    const backgroundName = selectedOption.text;
    const article = /^[aeiou]/i.test(backgroundName) ? game.i18n.localize('hm.app.equipment.article-plural') : game.i18n.localize('hm.app.equipment.article');

    return {
      article: article,
      link: `@UUID[${HM.SELECTED.background.uuid}]`
    };
  }

  /**
   * Collect equipment items from the UI
   * @returns {Array} Array of selected equipment items
   * @private
   */
  static #collectEquipmentItems() {
    // Collect all equipment items at once
    const selectedEquipment = Array.from(document.querySelectorAll('#equipment-container select, #equipment-container input[type="checkbox"]:checked'))
      .map((el) => this.#extractEquipmentItemData(el))
      .filter(Boolean);

    // Sort items - favorites first, then by type priority
    const priorityTypes = ['weapon', 'armor', 'shield'];

    selectedEquipment.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;

      // If both have same favorite status, use the type priority
      const aIndex = priorityTypes.indexOf(a.type);
      const bIndex = priorityTypes.indexOf(b.type);
      return (bIndex === -1 ? -999 : bIndex) - (aIndex === -1 ? -999 : aIndex);
    });

    // Take up to 3 items
    return selectedEquipment.slice(0, 3);
  }

  /**
   * Extract equipment item data from a DOM element
   * @param {HTMLElement} el - DOM element (select or checkbox)
   * @returns {Object|null} Equipment item data or null if invalid
   * @private
   */
  static #extractEquipmentItemData(el) {
    // For selects
    if (el.tagName === 'SELECT') {
      const selectedOption = el.options[el.selectedIndex];
      if (!selectedOption || !selectedOption.value || !selectedOption.value.includes('Compendium')) {
        return null;
      }

      const favoriteCheckbox = el.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
      const isFavorite = favoriteCheckbox?.checked || false;

      return {
        type: selectedOption.dataset.tooltip?.toLowerCase() || '',
        uuid: selectedOption.value,
        text: selectedOption.textContent?.trim(),
        favorite: isFavorite
      };
    }
    // For checkboxes
    else {
      const link = el.parentElement?.querySelector('.content-link');
      const uuid = link?.dataset?.uuid;

      if (!link || !uuid || uuid.includes(',') || !uuid.includes('Compendium')) {
        return null;
      }

      const favoriteCheckbox = el.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
      const isFavorite = favoriteCheckbox?.checked || false;

      return {
        type: link.dataset.tooltip?.toLowerCase() || '',
        uuid: uuid,
        text: link.textContent?.trim(),
        favorite: isFavorite
      };
    }
  }

  /**
   * Format and display equipment summary
   * @param {HTMLElement} summary - Summary element to update
   * @param {Array} displayEquipment - Equipment items to display
   * @returns {Promise<void>}
   * @private
   */
  static async #formatAndDisplayEquipmentSummary(summary, displayEquipment) {
    if (!displayEquipment.length) {
      summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
      return;
    }

    // Format individual items
    const formattedItems = displayEquipment.map((item) => {
      const itemName = item.text;
      const article = /^[aeiou]/i.test(itemName) ? game.i18n.localize('hm.app.equipment.article-plural') : game.i18n.localize('hm.app.equipment.article');
      return `${article} @UUID[${item.uuid}]{${item.text}}`;
    });

    // Join items with appropriate separators
    const content = game.i18n.format('hm.app.finalize.summary.equipment', {
      items:
        formattedItems.slice(0, -1).join(game.i18n.localize('hm.app.equipment.separator')) +
        (formattedItems.length > 1 ? game.i18n.localize('hm.app.equipment.and') : '') +
        formattedItems.slice(-1)
    });

    summary.innerHTML = await TextEditor.enrichHTML(content);
  }

  /**
   * Process ability highlights based on class preferences
   * @returns {void}
   * @private
   */
  static #processAbilityHighlights() {
    // First, remove any existing highlights
    const previousHighlights = document.querySelectorAll('.primary-ability');
    previousHighlights.forEach((el) => {
      el.classList.remove('primary-ability');
      el.removeAttribute('data-tooltip');
    });

    // Get current roll method
    const rollMethodSelect = document.getElementById('roll-method');
    const abilitiesTab = document.querySelector(".tab[data-tab='abilities']");
    const rollMethod = abilitiesTab?.dataset.currentMethod || rollMethodSelect?.value || 'standardArray';

    // Gather class primary abilities
    const primaryAbilities = this.#getPrimaryAbilitiesForClass();
    if (!primaryAbilities.size) return;

    // Process each ability block
    const abilityBlocks = document.querySelectorAll('.ability-block');
    abilityBlocks.forEach((block) => {
      this.#processAbilityBlock(block, primaryAbilities, rollMethod);
    });
  }

  /**
   * Get primary abilities for the selected class
   * @returns {Set<string>} Set of primary ability keys
   * @private
   */
  static #getPrimaryAbilitiesForClass() {
    const primaryAbilities = new Set();

    try {
      const classUUID = HM.SELECTED.class?.uuid;
      if (!classUUID) return primaryAbilities;

      const classItem = fromUuidSync(classUUID);
      if (!classItem) return primaryAbilities;

      // Get primary ability
      if (classItem?.system?.primaryAbility?.value?.length) {
        for (const ability of classItem.system.primaryAbility.value) {
          primaryAbilities.add(ability.toLowerCase());
        }
      }

      // Get spellcasting ability
      if (classItem?.system?.spellcasting?.ability) {
        primaryAbilities.add(classItem.system.spellcasting.ability.toLowerCase());
      }

      // Get saving throw proficiencies
      if (classItem?.advancement?.byType?.Trait) {
        const level1Traits = classItem.advancement.byType.Trait.filter((entry) => entry.level === 1 && entry.configuration.grants);

        for (const trait of level1Traits) {
          const grants = trait.configuration.grants;
          for (const grant of grants) {
            if (grant.startsWith('saves:')) {
              primaryAbilities.add(grant.split(':')[1].toLowerCase());
            }
          }
        }
      }
    } catch (error) {
      HM.log(1, 'Error getting class primary abilities:', error);
    }

    return primaryAbilities;
  }

  /**
   * Process an individual ability block
   * @param {HTMLElement} block - Ability block element
   * @param {Set<string>} primaryAbilities - Set of primary abilities
   * @param {string} rollMethod - Current roll method
   * @private
   */
  static #processAbilityBlock(block, primaryAbilities, rollMethod) {
    let abilityKey = '';
    let score = 0;

    // Extract ability key and score based on roll method
    if (rollMethod === 'pointBuy') {
      const hiddenInput = block.querySelector('input[type="hidden"]');
      if (hiddenInput) {
        const nameMatch = hiddenInput.name.match(/abilities\[(\w+)]/);
        if (nameMatch && nameMatch[1]) {
          abilityKey = nameMatch[1].toLowerCase();
        }
      }
      score = parseInt(block.querySelector('.current-score')?.innerHTML) || 0;
    } else if (rollMethod === 'standardArray' || rollMethod === 'manualFormula') {
    } else if (rollMethod === 'standardArray' || rollMethod === 'manualFormula') {
      const dropdown = block.querySelector('.ability-dropdown');
      if (dropdown) {
        if (rollMethod === 'standardArray') {
          const nameMatch = dropdown.name.match(/abilities\[(\w+)]/);
          if (nameMatch && nameMatch[1]) {
            abilityKey = nameMatch[1].toLowerCase();
          }
          score = parseInt(dropdown.value) || 0;
        } else {
          // manualFormula
          abilityKey = dropdown.value?.toLowerCase() || '';
          score = parseInt(block.querySelector('.ability-score')?.value) || 0;
        }
        if (rollMethod === 'standardArray') {
          const nameMatch = dropdown.name.match(/abilities\[(\w+)]/);
          if (nameMatch && nameMatch[1]) {
            abilityKey = nameMatch[1].toLowerCase();
          }
          score = parseInt(dropdown.value) || 0;
        } else {
          // manualFormula
          abilityKey = dropdown.value?.toLowerCase() || '';
          score = parseInt(block.querySelector('.ability-score')?.value) || 0;
        }
      }
    }

    // If not a primary ability, exit early
    if (!abilityKey || !primaryAbilities.has(abilityKey)) return;

    // Get class info for tooltip
    const classUUID = HM.SELECTED.class?.uuid;
    const classItem = classUUID ? fromUuidSync(classUUID) : null;
    const className = classItem?.name || game.i18n.localize('hm.app.abilities.your-class');

    this.#applyAbilityHighlight(block, abilityKey, className, rollMethod);
  }

  /**
   * Apply highlighting to ability elements
   * @param {HTMLElement} block - Ability block element
   * @param {string} abilityKey - Ability key
   * @param {string} className - Class name for tooltip
   * @param {string} rollMethod - Current roll method
   * @private
   */
  static #applyAbilityHighlight(block, abilityKey, className, rollMethod) {
    const abilityName = CONFIG.DND5E.abilities[abilityKey]?.label || abilityKey.toUpperCase();
    const tooltipText = game.i18n.format('hm.app.abilities.primary-tooltip', {
      ability: abilityName,
      class: className
    });

    // For all methods, highlight the label and add tooltip
    // For all methods, highlight the label and add tooltip
    const label = block.querySelector('.ability-label');
    if (label) {
      label.classList.add('primary-ability');
      label.setAttribute('data-tooltip', tooltipText);
    }

    // For standardArray and manualFormula, also highlight the dropdown
    if (rollMethod === 'standardArray' || rollMethod === 'manualFormula') {
      // For standardArray and manualFormula, also highlight the dropdown
      if (rollMethod === 'standardArray' || rollMethod === 'manualFormula') {
        const dropdown = block.querySelector('.ability-dropdown');
        if (dropdown) {
          dropdown.classList.add('primary-ability');
          dropdown.setAttribute('data-tooltip', tooltipText);
          dropdown.setAttribute('data-tooltip', tooltipText);
        }
      }

      // For pointBuy, highlight score display
      if (rollMethod === 'pointBuy') {
        const scoreElement = block.querySelector('.current-score');
        if (scoreElement) {
          scoreElement.classList.add('primary-ability');
          scoreElement.setAttribute('data-tooltip', tooltipText);
          // For pointBuy, highlight score display
          if (rollMethod === 'pointBuy') {
            const scoreElement = block.querySelector('.current-score');
            if (scoreElement) {
              scoreElement.classList.add('primary-ability');
              scoreElement.setAttribute('data-tooltip', tooltipText);
            }
          }
        }
      }
    }
  }

  /**
   * Update the ability summary content in the UI
   * @private
   */
  static #updateAbilitySummaryContent() {
    // Get ability scores
    const abilityScores = this.#collectAbilityScores();
    if (Object.keys(abilityScores).length === 0) return;

    // Get primary abilities
    const primaryAbilities = this.#getPrimaryAbilitiesForClass();

    // Sort and select top abilities
    const selectedAbilities = this.#selectTopAbilities(abilityScores, primaryAbilities);

    // Update the summary HTML
    this.#updateSummaryHTML(selectedAbilities);
  }

  /**
   * Collect ability scores from UI
   * @returns {Object} Map of ability scores
   * @private
   */
  static #collectAbilityScores() {
    const abilityScores = {};
    const rollMethodSelect = document.getElementById('roll-method');
    const abilitiesTab = document.querySelector(".tab[data-tab='abilities']");
    const rollMethod = abilitiesTab?.dataset.currentMethod || rollMethodSelect?.value || 'standardArray';

    const abilityBlocks = document.querySelectorAll('.ability-block');
    abilityBlocks.forEach((block) => {
      let abilityKey = '';
      let score = 0;

      // Logic from earlier method to extract scores based on roll method
      if (rollMethod === 'pointBuy') {
        const hiddenInput = block.querySelector('input[type="hidden"]');
        if (hiddenInput) {
          const nameMatch = hiddenInput.name.match(/abilities\[(\w+)]/);
          if (nameMatch && nameMatch[1]) {
            abilityKey = nameMatch[1].toLowerCase();
          }
        }
        score = parseInt(block.querySelector('.current-score')?.innerHTML) || 0;
      } else if (rollMethod === 'standardArray') {
        const dropdown = block.querySelector('.ability-dropdown');
        if (dropdown) {
          const nameMatch = dropdown.name.match(/abilities\[(\w+)]/);
          if (nameMatch && nameMatch[1]) {
            abilityKey = nameMatch[1].toLowerCase();
          }
          score = parseInt(dropdown.value) || 0;
        }
      } else if (rollMethod === 'manualFormula') {
        const dropdown = block.querySelector('.ability-dropdown');
        if (dropdown) {
          abilityKey = dropdown.value?.toLowerCase() || '';
          score = parseInt(block.querySelector('.ability-score')?.value) || 0;
        }
      }

      if (abilityKey) {
        abilityScores[abilityKey] = score;
      }
    });

    return abilityScores;
  }

  /**
   * Select top abilities for summary
   * @param {Object} abilityScores - Map of ability scores
   * @param {Set<string>} primaryAbilities - Set of primary abilities
   * @returns {string[]} Selected ability keys
   * @private
   */
  static #selectTopAbilities(abilityScores, primaryAbilities) {
    // Sort abilities by preference and then by score
    const sortedAbilities = Object.entries(abilityScores)
      .sort(([abilityA, scoreA], [abilityB, scoreB]) => {
        // First sort by preferred status
        const preferredA = primaryAbilities.has(abilityA);
        const preferredB = primaryAbilities.has(abilityB);

        if (preferredA && !preferredB) return -1;
        if (!preferredA && preferredB) return 1;

        // Then sort by score
        return scoreB - scoreA;
      })
      .map(([ability]) => ability.toLowerCase());

    // Select the top 2 abilities
    const selectedAbilities = [];
    for (const ability of sortedAbilities) {
      if (selectedAbilities.length < 2 && !selectedAbilities.includes(ability)) {
        selectedAbilities.push(ability);
      }
    }

    // If we still need more abilities, add highest scoring ones
    if (selectedAbilities.length < 2) {
      for (const [ability, score] of Object.entries(abilityScores).sort(([, a], [, b]) => b - a)) {
        if (!selectedAbilities.includes(ability) && selectedAbilities.length < 2) {
          selectedAbilities.push(ability);
        }
      }
    }

    return selectedAbilities;
  }

  /**
   * Update the summary HTML
   * @param {string[]} selectedAbilities - Selected ability keys
   * @returns {Promise<void>}
   * @private
   */
  static async #updateSummaryHTML(selectedAbilities) {
    const abilitiesSummary = document.querySelector('.abilities-summary');
    if (!abilitiesSummary) return;

    if (selectedAbilities.length >= 2) {
      const content = game.i18n.format('hm.app.finalize.summary.abilities', {
        first: `&Reference[${selectedAbilities[0]}]`,
        second: `&Reference[${selectedAbilities[1]}]`
      });
      abilitiesSummary.innerHTML = await TextEditor.enrichHTML(content);
    } else {
      abilitiesSummary.innerHTML = game.i18n.localize('hm.app.finalize.summary.abilitiesDefault');
    }
  }

  /**
   * Get character name for summary
   * @returns {string} Character name
   * @private
   */
  static #getCharacterName() {
    const nameInput = document.querySelector('#character-name');
    return nameInput?.value || game.user.name;
  }

  /**
   * Collect summary content from DOM
   * @returns {Object} Summary content by section
   * @private
   */
  static #collectSummaryContent() {
    return {
      classRace: document.querySelector('.class-race-summary')?.innerHTML || '',
      background: document.querySelector('.background-summary')?.innerHTML || '',
      abilities: document.querySelector('.abilities-summary')?.innerHTML || '',
      equipment: document.querySelector('.equipment-summary')?.innerHTML || ''
    };
  }

  /**
   * Build formatted HTML for summary message
   * @param {string} characterName - Character name
   * @param {Object} summaries - Summary content by section
   * @param {Actor} actor - The newly created actor
   * @returns {string} Formatted HTML
   * @private
   */
  static #buildSummaryMessageHTML(characterName, summaries, actor) {
    let message = `
  <div class="character-summary">
    <h2>${characterName}</h2>
    <div class="summaries">
  `;

    // Add each summary section if available
    if (summaries.background) {
      message += `<span class="summary-section background">${summaries.background}</span> `;
    }

    if (summaries.classRace) {
      message += `<span class="summary-section class-race">${summaries.classRace}</span> `;
    }

    if (summaries.abilities) {
      message += `<span class="summary-section abilities">${summaries.abilities}</span> `;
    }

    if (summaries.equipment) {
      message += `<span class="summary-section equipment">${summaries.equipment}</span>`;
    }

    message += '</div>';

    // Add ability scores table
    message += this.#buildAbilityScoresTable(actor);

    // Add inventory list
    message += this.#buildInventoryList(actor);

    message += '</div>';
    return message;
  }

  /**
   * Builds an HTML table showing ability scores and modifiers
   * @param {Actor} actor - The actor containing ability data
   * @returns {string} HTML table
   * @private
   */
  static #buildAbilityScoresTable(actor) {
    if (!actor?.system?.abilities) return '';

    let tableHTML = `
    <div class="ability-scores-summary">
      <h3>${game.i18n.localize('DND5E.AbilityScorePl')}</h3>
      <table class="ability-table">
        <tr>
          <th>${game.i18n.localize('DND5E.Ability')}</th>
          <th>${game.i18n.localize('DND5E.AbilityScoreShort')}</th>
          <th>${game.i18n.localize('DND5E.AbilityModifierShort')}</th>
        </tr>
  `;

    for (const [key, abilityConfig] of Object.entries(CONFIG.DND5E.abilities)) {
      const ability = actor.system.abilities[key];
      if (!ability) continue;

      const score = ability.value;
      const mod = ability.mod;
      const label = CONFIG.DND5E.abilities[key]?.label || key;
      const modPrefix = mod >= 0 ? '+' : '';

      tableHTML += `
      <tr>
        <td>${label.toUpperCase()}</td>
        <td>${score}</td>
        <td>${modPrefix}${mod}</td>
      </tr>
    `;
    }

    tableHTML += `
      </table>
    </div>
  `;

    return tableHTML;
  }

  /**
   * Builds a comma-separated list of all items and currency
   * @param {Actor} actor - The actor containing inventory and currency data
   * @returns {string} HTML inventory summary
   * @private
   */
  static #buildInventoryList(actor) {
    if (!actor) return '';

    const items = actor.items.filter((item) => !['class', 'subclass', 'race', 'background', 'feat', 'spell'].includes(item.type));

    let inventoryHTML = `
    <div class="inventory-summary">
      <h3>${game.i18n.localize('DND5E.StartingEquipment.Title')}</h3>
  `;

    // Build item list with UUID links
    if (items.length) {
      const itemLinks = items
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => `@UUID[${item.uuid}]`)
        .join(', ');

      inventoryHTML += `<p class="inventory-items">${itemLinks}</p>`;
    } else {
      inventoryHTML += `<p class="inventory-items"> ${game.i18n.localize('hm.app.finalize.summary.no-items')}</p>`;
    }

    // Add currency if any exists
    const currency = actor.system.currency;
    const hasCurrency = currency && Object.values(currency).some((v) => v > 0);

    if (hasCurrency) {
      inventoryHTML += `<h3>${game.i18n.localize('DND5E.StartingEquipment.Wealth.Label')}</h3><p class="starting-wealth">`;

      const currencyParts = [];
      for (const [coin, amount] of Object.entries(currency)) {
        if (amount > 0) {
          const coinConfig = CONFIG.DND5E.currencies[coin] || {};
          const iconPath = coinConfig.icon || '';
          const iconHtml = iconPath ? `<img src="${iconPath}" width="16" height="16" class="currency-icon">` : '';
          const label = coinConfig.abbreviation || coin;
          currencyParts.push(`${iconHtml}${amount} ${label}`);
        }
      }

      inventoryHTML += currencyParts.join(', ');
      inventoryHTML += '</p>';
    }

    inventoryHTML += '</div>';
    return inventoryHTML;
  }

  /**
   * Find a document by its ID and type
   * @param {string} type - Document type
   * @param {string} id - Document ID
   * @returns {Object|null} - Document object or null if not found
   * @private
   * @static
   */
  static async #findDocumentById(type, id) {
    // For race documents, search in folder structure
    if (type === 'race') {
      for (const folder of HM.documents.race) {
        const foundDoc = folder.docs.find((d) => d.id === id);
        if (foundDoc) return foundDoc;
      }
      return null;
    }

    // For other document types, search in flat array
    const docsArray = HM.documents[type] || [];
    return docsArray.find((d) => d.id === id);
  }

  /**
   * Render a journal page in the description element
   * @param {Object} doc - Document containing journal page reference
   * @param {HTMLElement} descriptionEl - Description element to update
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #renderJournalPage(doc, descriptionEl) {
    HM.log(3, `Found journal page ID ${doc.journalPageId} for ${doc.name}`);

    // Create container for journal embed if needed
    const container = descriptionEl.querySelector('.journal-container') || document.createElement('div');

    if (!container.classList.contains('journal-container')) {
      container.classList.add('journal-container');
      descriptionEl.innerHTML = '';
      descriptionEl.appendChild(container);
    }

    // Create and initialize the journal embed
    const embed = new JournalPageEmbed(container, {
      scrollable: true,
      height: 'auto'
    });

    // Attempt to render the journal page with the document name
    try {
      const result = await embed.render(doc.journalPageId, doc.name);

      if (result) {
        HM.log(3, `Successfully rendered journal page for ${doc.name}`);
        return;
      }

      // If rendering failed, throw error to fall through to regular description
      throw new Error('Failed to render journal page');
    } catch (error) {
      HM.log(2, `Failed to render journal page ${doc.journalPageId} for ${doc.name}: ${error.message}`);
      descriptionEl.innerHTML = '<div class="notification error">Failed to load journal page content</div>';

      // Wait a moment, then fall back to regular description
      setTimeout(() => this.#renderStandardDescription(doc, descriptionEl), 500);
    }
  }

  /**
   * Render standard text description
   * @param {Object} doc - Document to display
   * @param {HTMLElement} descriptionEl - Description element to update
   * @private
   * @static
   */
  static #renderStandardDescription(doc, descriptionEl) {
    // Find the journal container - might be the description element itself or a child
    let contentContainer = descriptionEl.classList.contains('journal-container') ? descriptionEl : descriptionEl.querySelector('.journal-container');

    if (!contentContainer) {
      // Create a content container if none exists
      contentContainer = document.createElement('div');
      contentContainer.classList.add('description-content');
      descriptionEl.appendChild(contentContainer);
    }

    // Set the description content
    if (doc.enrichedDescription) {
      contentContainer.innerHTML = doc.enrichedDescription;
    } else {
      contentContainer.innerHTML = doc.description || game.i18n.localize('hm.app.no-description');
    }
  }

  /**
   * Updates the basic info section of the review tab
   * @param {HTMLElement} container - The container element
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateBasicInfoReview(container) {
    // Get character name
    const characterName = document.querySelector('#character-name')?.value || game.user.name;

    // Update the character name in the heading
    const nameDisplay = document.querySelector('.character-name-display');
    if (nameDisplay) {
      nameDisplay.textContent = characterName;
    }

    // Update race, class, and background with links
    await this.#updateReviewValueWithLink(container, '.race-value', HM.SELECTED.race?.uuid);
    await this.#updateReviewValueWithLink(container, '.class-value', HM.SELECTED.class?.uuid);
    await this.#updateReviewValueWithLink(container, '.background-value', HM.SELECTED.background?.uuid);
  }

  /**
   * Updates a review value with a document link if available
   * @param {HTMLElement} container - The container element
   * @param {string} selector - Selector for the value element
   * @param {string} uuid - Document UUID
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateReviewValueWithLink(container, selector, uuid) {
    const element = container.querySelector(selector);
    if (!element) return;

    if (!uuid) {
      element.textContent = game.i18n.localize('hm.unknown');
      return;
    }

    try {
      const doc = await fromUuidSync(uuid);
      if (doc) {
        const linkHtml = `@UUID[${uuid}]{${doc.name}}`;
        element.innerHTML = await TextEditor.enrichHTML(linkHtml);
      } else {
        element.textContent = game.i18n.localize('hm.unknown');
      }
    } catch (error) {
      HM.log(2, `Error fetching document ${uuid}:`, error);
      element.textContent = game.i18n.localize('hm.unknown');
    }
  }

  /**
   * Updates the abilities section of the review tab
   * @param {HTMLElement} container - The container element
   * @returns {void}
   * @private
   * @static
   */
  static #updateAbilitiesReview(container) {
    container.innerHTML = ''; // Clear existing content

    // Get the current ability scores
    const abilityScores = this.#collectAbilityScores();

    // Create ability items
    for (const [key, ability] of Object.entries(CONFIG.DND5E.abilities)) {
      const score = abilityScores[key] || 10;
      const mod = Math.floor((score - 10) / 2);
      const modSign = mod >= 0 ? '+' : '';

      const abilityItem = document.createElement('div');
      abilityItem.className = 'ability-item';
      abilityItem.innerHTML = `
      <span class="ability-label">${ability.abbreviation.toUpperCase()}</span>
      <span class="ability-score">${score} (${modSign}${mod})</span>
    `;

      container.appendChild(abilityItem);
    }
  }

  /**
   * Updates the biography section of the review tab
   * @param {HTMLElement} container - The container element
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateBiographyReview(container) {
    container.innerHTML = ''; // Clear existing content

    // Collect biography data
    const bioData = this.#collectBiographyData();

    // Create main bio section
    const bioMainText = await this.#formatMainBiographyText(bioData);
    const bioMain = document.createElement('div');
    bioMain.className = 'bio-main';
    bioMain.innerHTML = bioMainText;
    container.appendChild(bioMain);

    // Create personality sections
    const traits = [
      { key: 'personalityTraits', label: 'DND5E.PersonalityTraits' },
      { key: 'ideals', label: 'DND5E.Ideals' },
      { key: 'bonds', label: 'DND5E.Bonds' },
      { key: 'flaws', label: 'DND5E.Flaws' }
    ];

    // Add each trait section if it has content
    traits.forEach((trait) => {
      if (bioData[trait.key]) {
        const traitSection = document.createElement('div');
        traitSection.className = `bio-detail ${trait.key}`;
        traitSection.innerHTML = `
        <h4>${game.i18n.localize(trait.label)}</h4>
        <p>${bioData[trait.key]}</p>
      `;
        container.appendChild(traitSection);
      }
    });

    // Add physical description if available
    if (bioData.physicalDescription) {
      const physDesc = document.createElement('div');
      physDesc.className = 'bio-detail physical-description';
      physDesc.innerHTML = `
      <h4>${game.i18n.localize('hm.app.finalize.review.physical-description')}</h4>
      <p>${bioData.physicalDescription}</p>
    `;
      container.appendChild(physDesc);
    }

    // Add backstory if available
    if (bioData.backstory) {
      const backstory = document.createElement('div');
      backstory.className = 'bio-detail backstory';
      backstory.innerHTML = `
      <h4>${game.i18n.localize('hm.app.finalize.review.backstory')}</h4>
      <div class="backstory-text">${await TextEditor.enrichHTML(bioData.backstory)}</div>
    `;
      container.appendChild(backstory);
    }
  }

  /**
   * Updates the proficiencies section of the review tab
   * Extracts proficiency data from selected race, class, and background
   * @param {HTMLElement} container The proficiencies list container
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateProficienciesReview(container) {
    try {
      // Clear the loading spinner
      container.innerHTML = '';

      // Initialize proficiency data structure
      const proficiencyData = {
        armor: new Set(),
        weapons: new Set(),
        tools: new Set(),
        savingThrows: new Set(),
        skills: new Set(),
        languages: new Set()
      };

      // Extract proficiencies from race
      await this.#extractRaceProficiencies(proficiencyData);

      // Extract proficiencies from class
      await this.#extractClassProficiencies(proficiencyData);

      // Extract proficiencies from background
      await this.#extractBackgroundProficiencies(proficiencyData);

      // Log final proficiency data
      HM.log(3, 'Final proficiency data collected:', {
        armor: Array.from(proficiencyData.armor),
        weapons: Array.from(proficiencyData.weapons),
        tools: Array.from(proficiencyData.tools),
        savingThrows: Array.from(proficiencyData.savingThrows),
        skills: Array.from(proficiencyData.skills),
        languages: Array.from(proficiencyData.languages)
      });

      // Generate and display the proficiency HTML
      const proficiencyHTML = this.#generateProficiencyHTML(proficiencyData);
      container.innerHTML = proficiencyHTML;
    } catch (error) {
      HM.log(1, 'Error updating proficiencies review:', error);
      container.innerHTML = `<div class="error-message">${game.i18n.localize('hm.app.finalize.review.proficiencies-error')}</div>`;
    }
  }

  /**
   * Extracts proficiencies granted by the selected race
   * @param {object} proficiencyData The proficiency data object to populate
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #extractRaceProficiencies(proficiencyData) {
    try {
      const race = await fromUuidSync(HM.SELECTED.race.uuid);
      if (!race) {
        HM.log(2, 'Race document not found');
        return;
      }

      // Check for trait advancements (which grant proficiencies)
      if (race.advancement?.byType?.Trait) {
        for (const trait of race.advancement.byType.Trait) {
          if (trait.configuration?.grants) {
            for (const grant of trait.configuration.grants) {
              this.#categorizeTraitGrant(grant, proficiencyData, race.name);
            }
          } else {
            HM.log(1, 'Trait has no grants');
          }
        }
      }

      // Check system data for languages
      if (race.system?.traits?.languages?.value) {
        HM.log(1, `Found ${race.system.traits.languages.value.length} languages in race system data`);

        for (const lang of race.system.traits.languages.value) {
          const langConfig = CONFIG.DND5E.languages[lang];
          HM.log(1, `Processing language: ${lang}`, langConfig);

          if (langConfig) {
            proficiencyData.languages.add({
              name: langConfig.label || lang,
              source: race.name
            });
            HM.log(1, `Added language: ${langConfig.label}`);
          } else {
            HM.log(2, `Language config not found for: ${lang}`);
          }
        }
      }
    } catch (error) {
      HM.log(1, 'Error extracting race proficiencies:', error);
    }
  }

  /**
   * Extracts proficiencies granted by the selected class
   * @param {object} proficiencyData The proficiency data object to populate
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #extractClassProficiencies(proficiencyData) {
    try {
      const classItem = await fromUuidSync(HM.SELECTED.class.uuid);
      if (!classItem) {
        HM.log(2, 'Class document not found');
        return;
      }

      // Extract from trait advancements (primary source for 5e classes)
      if (classItem.advancement?.byType?.Trait) {
        for (const trait of classItem.advancement.byType.Trait) {
          if (trait.configuration?.grants) {
            for (const grant of trait.configuration.grants) {
              this.#categorizeTraitGrant(grant, proficiencyData, classItem.name);
            }
          } else {
            HM.log(1, 'Class trait has no grants');
          }
        }
      } else {
        HM.log(1, 'No trait advancements found in class');
      }
    } catch (error) {
      HM.log(1, 'Error extracting class proficiencies:', error);
    }
  }

  /**
   * Extracts proficiencies granted by the selected background
   * @param {object} proficiencyData The proficiency data object to populate
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #extractBackgroundProficiencies(proficiencyData) {
    try {
      const background = await fromUuidSync(HM.SELECTED.background.uuid);
      if (!background) {
        HM.log(2, 'Background document not found');
        return;
      }

      // Check for trait advancements
      if (background.advancement?.byType?.Trait) {
        for (const trait of background.advancement.byType.Trait) {
          if (trait.configuration?.grants) {
            for (const grant of trait.configuration.grants) {
              this.#categorizeTraitGrant(grant, proficiencyData, background.name);
            }
          } else {
            HM.log(1, 'Background trait has no grants');
          }
        }
      } else {
        HM.log(1, 'No trait advancements found in background');
      }
    } catch (error) {
      HM.log(1, 'Error extracting background proficiencies:', error);
    }
  }

  /**
   * Categorizes a trait grant into the appropriate proficiency category
   * @param {string} grant The grant string to categorize
   * @param {object} proficiencyData The proficiency data object
   * @param {string} source The source of the proficiency
   * @private
   * @static
   */
  static #categorizeTraitGrant(grant, proficiencyData, source) {
    try {
      // Parse the grant string
      if (grant.startsWith('saves:')) {
        const ability = grant.split(':')[1];
        const abilityConfig = CONFIG.DND5E.abilities[ability];

        proficiencyData.savingThrows.add({
          name: abilityConfig.label,
          source: source
        });
      } else if (grant.startsWith('skills:')) {
        const skill = grant.split(':')[1];
        const skillConfig = CONFIG.DND5E.skills[skill];

        proficiencyData.skills.add({
          name: skillConfig.label,
          source: source
        });
      } else if (grant.startsWith('languages:')) {
        const langParts = grant.split(':');
        const langType = langParts[1]; // e.g., 'standard', 'exotic'
        const langSpecific = langParts[2]; // e.g., 'common', 'druidic'
        const langConfig = CONFIG.DND5E.languages[langType];
        proficiencyData.languages.add({
          name: langConfig.label,
          source: source
        });
      } else if (grant.startsWith('armor:')) {
        const armor = grant.split(':')[1];
        const armorConfig = CONFIG.DND5E.armorProficiencies?.[armor] || CONFIG.DND5E.armorTypes?.[armor];

        proficiencyData.armor.add({
          name: armorConfig.label || armorConfig,
          source: source
        });
      } else if (grant.startsWith('weapon:')) {
        const weapon = grant.split(':')[1];
        const weaponConfig = CONFIG.DND5E.weaponProficiencies?.[weapon] || CONFIG.DND5E.weaponTypes?.[weapon];

        proficiencyData.weapons.add({
          name: weaponConfig.label || weaponConfig,
          source: source
        });
      } else if (grant.startsWith('tool:')) {
        const toolParts = grant.split(':');
        const toolType = toolParts[1];
        const toolSpecific = toolParts[2];

        // Try different config locations for tools
        let toolConfig = CONFIG.DND5E.toolProficiencies?.[toolType] || CONFIG.DND5E.toolIds?.[grant] || CONFIG.DND5E.toolTypes?.[toolType];

        proficiencyData.tools.add({
          name: toolConfig?.label || toolConfig,
          source: source
        });
      } else {
        HM.log(2, `Unknown grant format: ${grant}`);
      }
    } catch (error) {
      HM.log(1, `Error categorizing grant "${grant}":`, error);
    }
  }

  /**
   * Generates HTML for displaying proficiencies
   * @param {object} proficiencyData The categorized proficiency data
   * @returns {string} HTML string for proficiencies display
   * @private
   * @static
   */
  static #generateProficiencyHTML(proficiencyData) {
    const sections = [];

    // Helper function to create a proficiency section
    const createSection = (title, items) => {
      const itemCount = items.size;
      if (items.size === 0) return '';
      const itemsArray = Array.from(items);
      const itemsHTML = itemsArray
        .map(
          (item) => `
        <div class="proficiency-item">
          <span class="proficiency-name">${item.name}</span>
          <span class="proficiency-source">(${item.source})</span>
        </div>
      `
        )
        .join('');

      return `
      <div class="proficiency-category">
        <h4 class="proficiency-category-title">${title}</h4>
        <div class="proficiency-items">
          ${itemsHTML}
        </div>
      </div>
    `;
    };

    // Generate sections for each proficiency type
    sections.push(createSection(game.i18n.localize('DND5E.TraitArmorProf'), proficiencyData.armor));
    sections.push(createSection(game.i18n.localize('DND5E.TraitWeaponProf'), proficiencyData.weapons));
    sections.push(createSection(game.i18n.localize('DND5E.TraitToolProf'), proficiencyData.tools));
    sections.push(createSection(game.i18n.localize('DND5E.ClassSaves'), proficiencyData.savingThrows));
    sections.push(createSection(game.i18n.localize('DND5E.Skills'), proficiencyData.skills));
    sections.push(createSection(game.i18n.localize('DND5E.Languages'), proficiencyData.languages));

    // Filter out empty sections
    const nonEmptySections = sections.filter((s) => s !== '');
    HM.log(3, `Generated ${nonEmptySections.length} non-empty sections`);

    if (nonEmptySections.length === 0) {
      HM.log(3, 'No proficiencies found, returning default message');
      return `<div class="no-proficiencies">${game.i18n.localize('hm.app.finalize.review.no-proficiencies')}</div>`;
    }

    return nonEmptySections.join('');
  }

  /**
   * Gets equipment items from background
   * @returns {Array<Object>} Array of background equipment items
   * @private
   * @static
   */
  static #getBackgroundEquipment() {
    // Check if using starting wealth for background
    const useStartingWealth = document.querySelector('#use-starting-wealth-background')?.checked || false;

    if (useStartingWealth) {
      // If using starting wealth, return special indicator
      const wealthAmount = document.querySelector('#starting-wealth-amount-background')?.value || '0 gp';
      return [
        {
          uuid: 'special-starting-wealth',
          name: game.i18n.format('hm.app.finalize.review.starting-wealth', { amount: wealthAmount }),
          isStartingWealth: true
        }
      ];
    }

    // Otherwise collect selected equipment
    const backgroundSection = document.querySelector('.background-equipment-section');
    if (!backgroundSection) return [];

    const items = [];

    // Process select elements (dropdowns)
    const selects = backgroundSection.querySelectorAll('select:not([disabled])');
    for (const select of selects) {
      if (!select.value) continue;

      // Get item details
      const itemName = select.options[select.selectedIndex]?.textContent || select.closest('table')?.querySelector('h4')?.textContent || 'Unknown Item';
      items.push({
        uuid: select.value,
        name: itemName,
        source: 'background'
      });
    }

    // Process checkboxes
    const checkboxes = backgroundSection.querySelectorAll('input[type="checkbox"]:not(.equipment-favorite-checkbox):not([disabled]):checked');
    for (const checkbox of checkboxes) {
      if (!checkbox.value || !checkbox.value.includes('Compendium')) continue;

      // Get item details
      const itemLink = checkbox.closest('label')?.querySelector('.content-link');
      const itemName = itemLink?.textContent || checkbox.closest('table')?.querySelector('h4')?.textContent || 'Unknown Item';
      items.push({
        uuid: checkbox.value,
        name: itemName,
        source: 'background'
      });
    }

    return items;
  }

  /**
   * Gets equipment items from class
   * @returns {Array<Object>} Array of class equipment items
   * @private
   * @static
   */
  static #getClassEquipment() {
    // Check if using starting wealth for class
    const useStartingWealth = document.querySelector('#use-starting-wealth-class')?.checked || false;

    if (useStartingWealth) {
      // If using starting wealth, return special indicator
      const wealthAmount = document.querySelector('#starting-wealth-amount-class')?.value || '0 gp';
      return [
        {
          uuid: 'special-starting-wealth',
          name: game.i18n.format('hm.app.finalize.review.starting-wealth', { amount: wealthAmount }),
          isStartingWealth: true
        }
      ];
    }

    // Otherwise collect selected equipment
    const classSection = document.querySelector('.class-equipment-section');
    if (!classSection) return [];

    const items = [];

    // Process select elements (dropdowns)
    const selects = classSection.querySelectorAll('select:not([disabled])');
    for (const select of selects) {
      if (!select.value) continue;

      // Get item details
      const itemName = select.options[select.selectedIndex]?.textContent || select.closest('table')?.querySelector('h4')?.textContent || 'Unknown Item';
      items.push({
        uuid: select.value,
        name: itemName,
        source: 'class'
      });
    }

    // Process checkboxes
    const checkboxes = classSection.querySelectorAll('input[type="checkbox"]:not(.equipment-favorite-checkbox):not([disabled]):checked');
    for (const checkbox of checkboxes) {
      if (!checkbox.value || !checkbox.value.includes('Compendium')) continue;

      // Get item details
      const itemLink = checkbox.closest('label')?.querySelector('.content-link');
      const itemName = itemLink?.textContent || checkbox.closest('table')?.querySelector('h4')?.textContent || 'Unknown Item';
      items.push({
        uuid: checkbox.value,
        name: itemName,
        source: 'class'
      });
    }

    return items;
  }

  /**
   * Updates the equipment section of the review tab
   * @param {HTMLElement} container - The container element
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateEquipmentReview(container) {
    // Clear current content
    container.innerHTML = '';

    // Check if ELKAN compatibility mode is active
    if (HM.COMPAT.ELKAN) {
      container.innerHTML = `<p>${game.i18n.localize('hm.app.finalize.summary.equipmentDefault')}</p>`;
      return;
    }

    // Get background and class equipment
    const backgroundItems = this.#getBackgroundEquipment();
    const classItems = this.#getClassEquipment();

    // Get background and class names
    const backgroundName = (await this.#getBackgroundName()) || game.i18n.localize('DND5E.Background');
    const className = (await this.#getClassName()) || game.i18n.localize('TYPES.Item.class');

    // Create equipment layout
    container.innerHTML = `
    <div class="equipment-layout">
      <div class="background-equipment">
        <h4>${game.i18n.format('hm.app.equipment.type-equipment', { type: backgroundName })}</h4>
        <div class="background-items"></div>
      </div>
      <div class="class-equipment">
        <h4>${game.i18n.format('hm.app.equipment.type-equipment', { type: className })}</h4>
        <div class="class-items"></div>
      </div>
    </div>
  `;

    // Update background equipment section
    const backgroundItemsEl = container.querySelector('.background-items');
    if (backgroundItemsEl) {
      if (backgroundItems.length > 0) {
        // Check if using starting wealth
        if (backgroundItems[0].isStartingWealth) {
          backgroundItemsEl.innerHTML = `<div class="equipment-wealth">${backgroundItems[0].name}</div>`;
        } else {
          // Regular equipment items
          const itemsHtml = await Promise.all(
            backgroundItems.map(async (item) => {
              return `<div class="equipment-item">${await TextEditor.enrichHTML(`@UUID[${item.uuid}]{${item.name}}`)}</div>`;
            })
          );
          backgroundItemsEl.innerHTML = itemsHtml.join('');
        }
      } else {
        backgroundItemsEl.innerHTML = `<em>${game.i18n.localize('hm.app.finalize.review.no-equipment')}</em>`;
      }
    }

    // Update class equipment section
    const classItemsEl = container.querySelector('.class-items');
    if (classItemsEl) {
      if (classItems.length > 0) {
        // Check if using starting wealth
        if (classItems[0].isStartingWealth) {
          classItemsEl.innerHTML = `<div class="equipment-wealth">${classItems[0].name}</div>`;
        } else {
          // Regular equipment items
          const itemsHtml = await Promise.all(
            classItems.map(async (item) => {
              return `<div class="equipment-item">${await TextEditor.enrichHTML(`@UUID[${item.uuid}]{${item.name}}`)}</div>`;
            })
          );
          classItemsEl.innerHTML = itemsHtml.join('');
        }
      } else {
        classItemsEl.innerHTML = `<em>${game.i18n.localize('hm.app.finalize.review.no-equipment')}</em>`;
      }
    }
  }

  /**
   * Gets the name of the selected background
   * @returns {Promise<string>} The background name
   * @private
   * @static
   */
  static async #getBackgroundName() {
    if (!HM.SELECTED.background?.uuid) return '';

    try {
      const background = await fromUuidSync(HM.SELECTED.background.uuid);
      return background?.name || '';
    } catch (error) {
      HM.log(2, `Error getting background name: ${error.message}`);
      return '';
    }
  }

  /**
   * Gets the name of the selected class
   * @returns {Promise<string>} The class name
   * @private
   * @static
   */
  static async #getClassName() {
    if (!HM.SELECTED.class?.uuid) return '';

    try {
      const classItem = await fromUuidSync(HM.SELECTED.class.uuid);
      return classItem?.name || '';
    } catch (error) {
      HM.log(2, `Error getting class name: ${error.message}`);
      return '';
    }
  }

  /**
   * Collects biography data from form inputs
   * @returns {Object} Biography data
   * @private
   * @static
   */
  static #collectBiographyData() {
    return {
      alignment: document.querySelector('#alignment')?.value || '',
      size: document.querySelector('#size')?.value || '',
      gender: document.querySelector('#gender')?.value || '',
      age: document.querySelector('#age')?.value || '',
      weight: document.querySelector('#weight')?.value || '',
      height: document.querySelector('#height')?.value || '',
      eyes: document.querySelector('#eyes')?.value || '',
      hair: document.querySelector('#hair')?.value || '',
      skin: document.querySelector('#skin')?.value || '',
      faith: document.querySelector('#faith')?.value || '',
      personalityTraits: document.querySelector('#personality')?.value || '',
      ideals: document.querySelector('#ideals')?.value || '',
      bonds: document.querySelector('#bonds')?.value || '',
      flaws: document.querySelector('#flaws')?.value || '',
      physicalDescription: document.querySelector('#description')?.value || '',
      backstory: document.querySelector('#backstory')?.value || ''
    };
  }

  /**
   * Formats the main biography text with localization
   * @param {Object} bioData - Biography data
   * @returns {string} Formatted text
   * @private
   * @static
   */
  static async #formatMainBiographyText(bioData) {
    // Get random adjectives for eyes and skin
    const adjectives = game.i18n.localize('hm.app.finalize.review.appearance-adjectives').split(',');
    const eyesAdjective = adjectives[Math.floor(Math.random() * adjectives.length)].trim();
    const skinAdjective = adjectives[Math.floor(Math.random() * adjectives.length)].trim();

    // Base format string
    let formatString = 'hm.app.finalize.review.biography-format';

    // Data for localization
    const formatData = {
      alignment: bioData.alignment || game.i18n.localize('hm.unknown'),
      size: bioData.size || game.i18n.localize('hm.unknown'),
      gender: bioData.gender || game.i18n.localize('hm.unknown'),
      age: bioData.age || game.i18n.localize('hm.unknown'),
      weight: bioData.weight || game.i18n.localize('hm.unknown'),
      height: bioData.height || game.i18n.localize('hm.unknown'),
      eyesAdjective: eyesAdjective,
      eyes: bioData.eyes || game.i18n.localize('hm.unknown'),
      hair: bioData.hair || game.i18n.localize('hm.unknown'),
      skinAdjective: skinAdjective,
      skin: bioData.skin || game.i18n.localize('hm.unknown')
    };

    // Check if faith should be included
    const includeFaith = bioData.faith && bioData.faith !== game.i18n.localize('None');

    // Use format string with or without faith
    formatString = includeFaith ? 'hm.app.finalize.review.biography-format-with-faith' : formatString;

    // Add faith data if needed
    if (includeFaith) {
      formatData.faith = bioData.faith;
    }

    // Format the text
    return game.i18n.format(formatString, formatData);
  }
}
