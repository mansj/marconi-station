(function(storyContent) {

    // Create ink story from the content using inkjs
    var story = new inkjs.Story(storyContent);

    // Add error handler
    story.onError = function(message, type) {
        if (type === "RUNTIME WARNING" && message.includes("exact internal story location couldn't be found")) {
            console.warn("Save state mismatch detected - clearing save and restarting");
            // Clear save state and restart
            try {
                window.localStorage.removeItem('save-state');
                document.getElementById("reload").setAttribute("disabled", "disabled");
                restart();
                return true; // Prevent error from propagating
            } catch (e) {
                console.warn("Couldn't clear save state:", e);
            }
        }
        console.warn(`Story error (${type}):`, message);
    };

    var savePoint = "";
    var isMuted = false;
    var isMusicMuted = false;
    var isLoopMuted = false;
    var musicVolume = 1.0;
    var loopVolume = 1.0;
    
    // Howler.js audio instances
    var currentSound = null;
    var currentLoop = null;
    var currentMusic = null;
    var acceptSound = null;

    // Configure Howler global settings
    Howler.autoUnlock = true;
    Howler.usingWebAudio = true;  // Force Web Audio API
    
    // Initialize accept sound
    acceptSound = new Howl({
        src: ['./audio/accept.mp3'],
        volume: 1.0,
        preload: true,
        html5: false,  // Force Web Audio API
        format: ['mp3']
    });

    // Initialize mute state and volumes from localStorage
    try {
        isMuted = window.localStorage.getItem('marconi-mute') === 'true';
        isMusicMuted = window.localStorage.getItem('marconi-music-mute') === 'true';
        isLoopMuted = window.localStorage.getItem('marconi-loop-mute') === 'true';
        musicVolume = parseFloat(window.localStorage.getItem('marconi-music-volume')) || 1.0;
        loopVolume = parseFloat(window.localStorage.getItem('marconi-loop-volume')) || 1.0;
        // Set initial Howler volume based on mute state
        Howler.volume(isMuted ? 0 : 1);
    } catch (e) {
        // Ignore localStorage errors
    }

    let savedTheme;
    let globalTagTheme;

    // Global tags - those at the top of the ink file
    // We support:
    //  # theme: dark
    //  # author: Your Name
    var globalTags = story.globalTags;
    if( globalTags ) {
        for(var i=0; i<story.globalTags.length; i++) {
            var globalTag = story.globalTags[i];
            var splitTag = splitPropertyTag(globalTag);

            // THEME: dark
            if( splitTag && splitTag.property == "theme" ) {
                globalTagTheme = splitTag.val;
            }

            // author: Your Name
            else if( splitTag && splitTag.property == "author" ) {
                var byline = document.querySelector('.byline');
                byline.innerHTML = "by "+splitTag.val;
            }
        }
    }

    var storyContainer = document.querySelector('#story');
    var outerScrollContainer = document.querySelector('.outerContainer');

    // page features setup
    setupTheme(globalTagTheme);
    var hasSave = loadSavePoint();
    setupButtons(hasSave);
    setupMuteButton();

    // Set initial save point
    savePoint = story.state.toJson();

    // Setup start button
    var startButton = document.getElementById('start-game');
    var startScreen = document.getElementById('start-screen');
    
    startButton.addEventListener('click', function() {
        // Clear any existing save state for a fresh start
        window.localStorage.removeItem('save-state');
        document.getElementById("reload").setAttribute("disabled", "disabled");
        story.ResetState();
        
        // Hide start screen
        startScreen.style.display = 'none';
        // Show game container
        outerScrollContainer.style.display = 'block';
        // Start the story fresh
        continueStory(true);
    });
	
    function setupMuteButton() {
        // Create container for all audio controls
        const muteControls = document.createElement('div');
        muteControls.style.position = 'fixed';
        muteControls.style.top = '50px';
        muteControls.style.right = '10px';
        muteControls.style.zIndex = '1000';
        muteControls.style.display = 'flex';
        muteControls.style.flexDirection = 'column';
        muteControls.style.gap = '5px';
        muteControls.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        muteControls.style.padding = '10px';
        muteControls.style.borderRadius = '5px';
        document.body.appendChild(muteControls);

        // Main mute button container
        const mainMuteControls = document.createElement('div');
        mainMuteControls.style.display = 'flex';
        mainMuteControls.style.flexDirection = 'column';
        mainMuteControls.style.gap = '5px';
        muteControls.appendChild(mainMuteControls);

        // Main mute button
        const muteButton = document.createElement('button');
        muteButton.textContent = isMuted ? '🔇 All Sound' : '🔊 All Sound';
        muteButton.style.padding = '5px 10px';
        muteButton.addEventListener('click', function() {
            isMuted = !isMuted;
            muteButton.textContent = isMuted ? '🔇 All Sound' : '🔊 All Sound';
            window.localStorage.setItem('marconi-mute', isMuted ? 'true' : 'false');
            
            // Set global Howler volume
            Howler.volume(isMuted ? 0 : 1);

            // If unmuting, check if music and loops should be playing
            if (!isMuted) {
                if (currentMusic && !currentMusic.playing() && !isMusicMuted) {
                    currentMusic.play();
                }
                if (currentLoop && !currentLoop.playing() && !isLoopMuted) {
                    currentLoop.play();
                }
            }
        });
        mainMuteControls.appendChild(muteButton);

        // Music controls container
        const musicControls = document.createElement('div');
        musicControls.style.display = 'flex';
        musicControls.style.flexDirection = 'column';
        musicControls.style.gap = '5px';
        muteControls.appendChild(musicControls);

        // Music mute button
        const musicMuteButton = document.createElement('button');
        musicMuteButton.textContent = isMusicMuted ? '🔇 Music' : '🔊 Music';
        musicMuteButton.style.padding = '5px 10px';
        musicMuteButton.addEventListener('click', function() {
            isMusicMuted = !isMusicMuted;
            musicMuteButton.textContent = isMusicMuted ? '🔇 Music' : '🔊 Music';
            window.localStorage.setItem('marconi-music-mute', isMusicMuted ? 'true' : 'false');
            
            if (currentMusic) {
                if (isMusicMuted) {
                    currentMusic.volume(0);
                } else {
                    currentMusic.volume(musicVolume);
                    // If unmuting and not playing, start playback
                    if (!currentMusic.playing() && !isMuted) {
                        currentMusic.play();
                    }
                }
            }
        });
        musicControls.appendChild(musicMuteButton);

        // Music volume slider
        const musicSlider = document.createElement('input');
        musicSlider.type = 'range';
        musicSlider.min = '0';
        musicSlider.max = '100';
        musicSlider.value = musicVolume * 100;
        musicSlider.style.width = '100px';
        musicSlider.addEventListener('input', function() {
            musicVolume = this.value / 100;
            window.localStorage.setItem('marconi-music-volume', musicVolume.toString());
            if (currentMusic && currentMusic.playing() && !isMusicMuted) {
                currentMusic.volume(musicVolume);
            }
        });
        musicControls.appendChild(musicSlider);

        // Loop controls container
        const loopControls = document.createElement('div');
        loopControls.style.display = 'flex';
        loopControls.style.flexDirection = 'column';
        loopControls.style.gap = '5px';
        muteControls.appendChild(loopControls);

        // Audioloop mute button
        const loopMuteButton = document.createElement('button');
        loopMuteButton.textContent = isLoopMuted ? '🔇 Loops' : '🔊 Loops';
        loopMuteButton.style.padding = '5px 10px';
        loopMuteButton.addEventListener('click', function() {
            isLoopMuted = !isLoopMuted;
            loopMuteButton.textContent = isLoopMuted ? '🔇 Loops' : '🔊 Loops';
            window.localStorage.setItem('marconi-loop-mute', isLoopMuted ? 'true' : 'false');
            
            if (currentLoop) {
                if (isLoopMuted) {
                    currentLoop.volume(0);
                } else {
                    currentLoop.volume(loopVolume);
                    // If unmuting and not playing, start playback
                    if (!currentLoop.playing() && !isMuted) {
                        currentLoop.play();
                    }
                }
            }
        });
        loopControls.appendChild(loopMuteButton);

        // Loop volume slider
        const loopSlider = document.createElement('input');
        loopSlider.type = 'range';
        loopSlider.min = '0';
        loopSlider.max = '100';
        loopSlider.value = loopVolume * 100;
        loopSlider.style.width = '100px';
        loopSlider.addEventListener('input', function() {
            loopVolume = this.value / 100;
            window.localStorage.setItem('marconi-loop-volume', loopVolume.toString());
            if (currentLoop && currentLoop.playing() && !isLoopMuted) {
                currentLoop.volume(loopVolume);
            }
        });
        loopControls.appendChild(loopSlider);
    }

    // Main story processing function. Each time this is called it generates
    // all the next content up as far as the next set of choices.
    function continueStory(firstTime) {

        var paragraphIndex = 0;
        var delay = 0.0;

        // Don't over-scroll past new content
        var previousBottomEdge = firstTime ? 0 : contentBottomEdgeY();

        // Generate story text - loop through available content
        while(story.canContinue) {

            // Get ink to generate the next paragraph
            var paragraphText = story.Continue();
            var tags = story.currentTags;

            // Any special tags included with this line
            var customClasses = [];
            for(var i=0; i<tags.length; i++) {
                var tag = tags[i];

                // Detect tags of the form "X: Y". Currently used for IMAGE and CLASS but could be
                // customised to be used for other things too.
                var splitTag = splitPropertyTag(tag);

                // AUDIO: src
                if( splitTag && splitTag.property == "AUDIO" ) {
                    if(currentSound) {
                        currentSound.unload();  // Properly unload previous sound
                    }
                    // Create new Howl instance for one-shot sounds
                    currentSound = new Howl({
                        src: ['./audio/' + splitTag.val],
                        volume: isMuted ? 0 : 1.0,
                        html5: false,  // Force Web Audio API
                        format: ['mp3'],
                        onload: function() {
                            if (!isMuted) {
                                this.play();
                            }
                        }
                    });
                }

                // AUDIOLOOP: src
                else if( splitTag && splitTag.property == "AUDIOLOOP" ) {
                    if(currentLoop) {
                        currentLoop.unload();  // Properly unload previous loop
                    }
                    
                    // Create new Howl instance for loop
                    currentLoop = new Howl({
                        src: ['./audioloops/' + splitTag.val],
                        loop: true,
                        volume: isLoopMuted ? 0 : loopVolume,
                        html5: false,  // Force Web Audio API
                        format: ['mp3'],
                        onload: function() {
                            if (!isLoopMuted) {
                                this.play();
                            }
                        }
                    });
                }

                // MUSIC: src
                else if( splitTag && splitTag.property == "MUSIC" ) {
                    if(currentMusic) {
                        currentMusic.unload();  // Properly unload previous music
                    }
                    
                    // Create new Howl instance for music
                    currentMusic = new Howl({
                        src: ['./music/' + splitTag.val],
                        loop: true,
                        volume: isMusicMuted ? 0 : musicVolume,
                        html5: true,  // Use HTML5 audio
                        format: ['mp3'],
                        onload: function() {
                            if (!isMusicMuted) {
                                this.play();
                            }
                        }
                    });
                }

                // IMAGE: src
                else if( splitTag && splitTag.property == "IMAGE" ) {
                    // Remove any existing blur elements
                    var existingBlurs = document.querySelectorAll('.blur-side');
                    existingBlurs.forEach(function(el) {
                        el.style.opacity = '0';
                        setTimeout(function() { el.remove(); }, 1500);
                    });

                    // Create a container for the image setup
                    var imageContainer = document.createElement('div');
                    imageContainer.classList.add('image-container');
                    
                    // Create the main image
                    var imageElement = document.createElement('img');
                    // Prepend images/ folder to the image path
                    var imagePath = 'images/' + splitTag.val;
                    imageElement.classList.add('main-image');
                    
                    // Create the background blur elements
                    var blurLeft = document.createElement('div');
                    var blurRight = document.createElement('div');
                    blurLeft.classList.add('blur-side', 'blur-left');
                    blurRight.classList.add('blur-side', 'blur-right');
                    blurLeft.style.opacity = '0';
                    blurRight.style.opacity = '0';

                    // Helper to set blur backgrounds
                    function setBlurBackground(url) {
                        blurLeft.style.backgroundImage = `url(${url})`;
                        blurRight.style.backgroundImage = `url(${url})`;
                        setTimeout(function() {
                            blurLeft.style.opacity = '1';
                            blurRight.style.opacity = '1';
                        }, 150);
                    }

                    // Wait for the image to load
                    imageElement.onload = function() {
                        // For GIFs, create a canvas to get the first frame
                        if (imagePath.toLowerCase().endsWith('.gif')) {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            canvas.width = imageElement.naturalWidth;
                            canvas.height = imageElement.naturalHeight;
                            ctx.drawImage(imageElement, 0, 0);
                            const firstFrameUrl = canvas.toDataURL('image/png');
                            setBlurBackground(firstFrameUrl);
                        } else {
                            setBlurBackground(imagePath);
                        }
                        
                        // After all images are loaded, scroll to show the new content
                        if (!firstTime) {
                            setTimeout(function() {
                                scrollDown(contentBottomEdgeY());
                            }, 100); // Small delay to ensure all content is rendered
                        }
                    };

                    imageElement.onerror = function() {
                        console.debug("Error loading image:", imagePath);
                        setBlurBackground('');
                    };
                    
                    // Add elements to the DOM
                    var outerContainer = document.querySelector('.outerContainer');
                    outerContainer.appendChild(blurLeft);
                    outerContainer.appendChild(blurRight);
                    imageContainer.appendChild(imageElement);
                    storyContainer.appendChild(imageContainer);
                    
                    // Set src after setting up event handlers
                    imageElement.src = imagePath;
                    
                    showAfter(delay, imageContainer);
                    delay += 200.0;
                }

                // LINK: url
                else if( splitTag && splitTag.property == "LINK" ) {
                    window.location.href = splitTag.val;
                }

                // LINKOPEN: url
                else if( splitTag && splitTag.property == "LINKOPEN" ) {
                    window.open(splitTag.val);
                }

                // BACKGROUND: src
                else if( splitTag && splitTag.property == "BACKGROUND" ) {
                    outerScrollContainer.style.backgroundImage = 'url('+splitTag.val+')';
                }

                // CLASS: className
                else if( splitTag && splitTag.property == "CLASS" ) {
                    customClasses.push(splitTag.val);
                }

                // CLEAR - removes all existing content.
                // RESTART - clears everything and restarts the story from the beginning
                else if( tag == "CLEAR" || tag == "RESTART" ) {
                    removeAll("p");
                    removeAll("img");

                    // Comment out this line if you want to leave the header visible when clearing
                    setVisible(".header", false);

                    if( tag == "RESTART" ) {
                        restart();
                        return;
                    }
                }
            }

            // Create paragraph element (initially hidden)
            var paragraphElement = document.createElement('p');
            paragraphElement.innerHTML = paragraphText;
            storyContainer.appendChild(paragraphElement);

            // Add any custom classes derived from ink tags
            for(var i=0; i<customClasses.length; i++)
                paragraphElement.classList.add(customClasses[i]);

            // Fade in paragraph after a short delay
            showAfter(delay, paragraphElement);
            delay += 200.0;
        }

        // Create HTML choices from ink choices
        if (story.currentChoices.length > 0) {
            storyContainer.classList.add('choices-active');
        }
        story.currentChoices.forEach(function(choice) {

            // Create paragraph with anchor element
            var choiceParagraphElement = document.createElement('p');
            choiceParagraphElement.classList.add("choice");
            choiceParagraphElement.innerHTML = choice.text;
            storyContainer.appendChild(choiceParagraphElement);

            // Fade choice in after a short delay
            showAfter(delay, choiceParagraphElement);
            delay += 200.0;

            // Click on choice
            choiceParagraphElement.addEventListener("click", function(event) {
                // Don't follow <a> link
                event.preventDefault();

                // Play accept sound if not muted
                if (!isMuted) {
                    acceptSound.play();
                }

                // Mark this choice as selected
                this.classList.add('selected');

                // Disable all choices
                var allChoices = document.querySelectorAll('.choice');
                allChoices.forEach(function(choice) {
                    choice.classList.add('disabled');
                });

                // Remove extra space after choices are made
                storyContainer.classList.remove('choices-active');

                // Tell the story where to go next
                story.ChooseChoiceIndex(choice.index);

                // This is where the save button will save from
                savePoint = story.state.toJson();

                // Aaand loop
                continueStory();
            });
        });

        // Extend height to fit
        // We do this manually so that removing elements and creating new ones doesn't
        // cause the height (and therefore scroll) to jump backwards temporarily.
        // storyContainer.style.height = contentBottomEdgeY()+"px";

        if( !firstTime )
            scrollDown(previousBottomEdge);

    }

    function restart() {
        story.ResetState();

        setVisible(".header", true);

        // set save point to here
        savePoint = story.state.toJson();

        continueStory(true);

        outerScrollContainer.scrollTo(0, 0);
    }

    // -----------------------------------
    // Various Helper functions
    // -----------------------------------

    // Fades in an element after a specified delay
    function showAfter(delay, el) {
        el.classList.add("hide");
        setTimeout(function() { el.classList.remove("hide") }, delay);
    }

    // Scrolls the page down, but no further than the bottom edge of what you could
    // see previously, so it doesn't go too far.
    function scrollDown(previousBottomEdge) {

        // Line up top of screen with the bottom of where the previous content ended
        var target = previousBottomEdge;

        // Can't go further than the very bottom of the page
        var limit = outerScrollContainer.scrollHeight - outerScrollContainer.clientHeight;
        if( target > limit ) target = limit;

        var start = outerScrollContainer.scrollTop;

        var dist = target - start;
        var duration = 300 + 300*dist/100;
        var startTime = null;
        function step(time) {
            if( startTime == null ) startTime = time;
            var t = (time-startTime) / duration;
            var lerp = 3*t*t - 2*t*t*t; // ease in/out
            outerScrollContainer.scrollTo(0, (1.0-lerp)*start + lerp*target);
            if( t < 1 ) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // The Y coordinate of the bottom end of all the story content, used
    // for growing the container, and deciding how far to scroll.
    function contentBottomEdgeY() {
        var bottomElement = storyContainer.lastElementChild;
        // Use scrollHeight to get the full height of the content
        return storyContainer.scrollHeight;
    }

    // Remove all elements that match the given selector. Used for removing choices after
    // you've picked one, as well as for the CLEAR and RESTART tags.
    function removeAll(selector)
    {
        var allElements = storyContainer.querySelectorAll(selector);
        for(var i=0; i<allElements.length; i++) {
            var el = allElements[i];
            el.parentNode.removeChild(el);
        }
    }

    // Used for hiding and showing the header when you CLEAR or RESTART the story respectively.
    function setVisible(selector, visible)
    {
        var allElements = storyContainer.querySelectorAll(selector);
        for(var i=0; i<allElements.length; i++) {
            var el = allElements[i];
            if( !visible )
                el.classList.add("invisible");
            else
                el.classList.remove("invisible");
        }
    }

    // Helper for parsing out tags of the form:
    //  # PROPERTY: value
    // e.g. IMAGE: source path
    function splitPropertyTag(tag) {
        var propertySplitIdx = tag.indexOf(":");
        if( propertySplitIdx != null ) {
            var property = tag.substr(0, propertySplitIdx).trim();
            var val = tag.substr(propertySplitIdx+1).trim();
            return {
                property: property,
                val: val
            };
        }

        return null;
    }

    // Loads save state if exists in the browser memory
    function loadSavePoint() {
        try {
            let savedState = window.localStorage.getItem('save-state');
            if (savedState) {
                try {
                    story.state.LoadJson(savedState);
                    return true;
                } catch (e) {
                    console.warn("Error loading save state:", e);
                    // Clear invalid save state
                    window.localStorage.removeItem('save-state');
                    document.getElementById("reload").setAttribute("disabled", "disabled");
                }
            }
        } catch (e) {
            console.debug("Couldn't access save state");
        }
        return false;
    }

    // Detects which theme (light or dark) to use
    function setupTheme(globalTagTheme) {

        // load theme from browser memory
        var savedTheme;
        try {
            savedTheme = window.localStorage.getItem('theme');
        } catch (e) {
            console.debug("Couldn't load saved theme");
        }

        // Check whether the OS/browser is configured for dark mode
        var browserDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

        if (savedTheme === "dark"
            || (savedTheme == undefined && globalTagTheme === "dark")
            || (savedTheme == undefined && globalTagTheme == undefined && browserDark))
            document.body.classList.add("dark");
    }

    // Used to hook up the functionality for global functionality buttons
    function setupButtons(hasSave) {

        let rewindEl = document.getElementById("rewind");
        if (rewindEl) rewindEl.addEventListener("click", function(event) {
            removeAll("p");
            removeAll("img");
            setVisible(".header", false);
            restart();
        });

        let saveEl = document.getElementById("save");
        if (saveEl) saveEl.addEventListener("click", function(event) {
            try {
                window.localStorage.setItem('save-state', savePoint);
                document.getElementById("reload").removeAttribute("disabled");
                window.localStorage.setItem('theme', document.body.classList.contains("dark") ? "dark" : "");
            } catch (e) {
                console.warn("Couldn't save state");
            }
        });

        let reloadEl = document.getElementById("reload");
        if (!hasSave) {
            reloadEl.setAttribute("disabled", "disabled");
        }
        reloadEl.addEventListener("click", function(event) {
            if (reloadEl.getAttribute("disabled"))
                return;

            removeAll("p");
            removeAll("img");
            try {
                let savedState = window.localStorage.getItem('save-state');
                if (savedState) {
                    try {
                        story.state.LoadJson(savedState);
                    } catch (e) {
                        console.warn("Error loading save state:", e);
                        // Clear invalid save state
                        window.localStorage.removeItem('save-state');
                        reloadEl.setAttribute("disabled", "disabled");
                        restart();
                        return;
                    }
                }
            } catch (e) {
                console.debug("Couldn't load save state");
            }
            continueStory(true);
        });

        let themeSwitchEl = document.getElementById("theme-switch");
        if (themeSwitchEl) themeSwitchEl.addEventListener("click", function(event) {
            document.body.classList.add("switched");
            document.body.classList.toggle("dark");
        });
    }

})(storyContent);
