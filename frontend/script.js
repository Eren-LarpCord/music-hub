document.addEventListener('DOMContentLoaded', () => {

    // --- Globale State ---
    let allSongs = [];
    let allPlaylists = [];
    let currentQueue = []; 
    let currentSongIndex = -1;
    let currentView = { type: 'all-songs', id: null };
    let currentActiveNavItem = null; 

    // --- NIEUW: Web Audio API (voor normalisatie) ---
    let audioCtx;
    let compressor;
    let audioSource;
    let isAudioApiInit = false; // Vlag om te checken of de API is gestart

    // --- DOM Elementen ---
    const audioPlayer = document.getElementById('audio-player');
    
    const songListTbody = document.getElementById('song-list-tbody');
    const playlistList = document.getElementById('playlist-list');
    const currentViewTitle = document.getElementById('current-view-title');
    
    const btnPlayPause = document.getElementById('btn-play-pause');
    const iconPlayPause = document.getElementById('icon-play-pause');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const playerThumbnail = document.getElementById('player-thumbnail');
    const playerTitle = document.getElementById('player-title');
    const playerArtist = document.getElementById('player-artist');
    const playerSeeker = document.getElementById('player-seeker');
    const playerCurrentTime = document.getElementById('player-current-time');
    const playerDuration = document.getElementById('player-duration');
    const playerVolume = document.getElementById('player-volume');
    const volumeIcon = document.getElementById('volume-icon');

    const formAddSong = document.getElementById('form-add-song');
    const inputAddUrl = document.getElementById('input-add-url');
    const formUploadMp3 = document.getElementById('form-upload-mp3');
    const inputUploadFile = document.getElementById('input-upload-file');
    const btnUploadSubmit = document.getElementById('btn-upload-submit');
    const tabBtnUrl = document.getElementById('tab-btn-url');
    const tabBtnUpload = document.getElementById('tab-btn-upload');
    const tabContentUrl = document.getElementById('tab-content-url');
    const tabContentUpload = document.getElementById('tab-content-upload');
    const downloadStatusContainer = document.getElementById('download-status-container');
    const formCreatePlaylist = document.getElementById('form-create-playlist');
    const inputNewPlaylist = document.getElementById('input-new-playlist'); 

    const navAllSongs = document.getElementById('nav-all-songs');
    const btnDeletePlaylist = document.getElementById('btn-delete-playlist');
    currentActiveNavItem = navAllSongs; 

    // --- Tab Schakelaars ---
    tabBtnUrl.addEventListener('click', () => {
        tabContentUrl.classList.remove('hidden');
        tabContentUpload.classList.add('hidden');
        tabBtnUrl.classList.add('text-white', 'border-green-500');
        tabBtnUrl.classList.remove('text-gray-400');
        tabBtnUpload.classList.add('text-gray-400');
        tabBtnUpload.classList.remove('text-white', 'border-green-500');
    });
    tabBtnUpload.addEventListener('click', () => {
        tabContentUrl.classList.add('hidden');
        tabContentUpload.classList.remove('hidden');
        tabBtnUrl.classList.add('text-gray-400');
        tabBtnUrl.classList.remove('text-white', 'border-green-500');
        tabBtnUpload.classList.add('text-white', 'border-green-500');
        tabBtnUpload.classList.remove('text-gray-400');
    });

    // --- Utility Functies ---
    
    const formatTime = (seconds) => {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const getStatusIcon = (status, errorMsg) => {
        switch (status) {
            case 'complete': return '<i class="fas fa-check-circle text-green-500" title="Voltooid"></i>';
            case 'downloading': return '<i class="fas fa-spinner fa-spin text-blue-400" title="Bezig met downloaden..."></i>';
            case 'pending': return '<i class="fas fa-clock text-gray-500" title="In wachtrij..."></i>';
            case 'error': return `<i class="fas fa-exclamation-triangle text-red-500" title="${errorMsg || 'Fout'}"></i>`;
            default: return '';
        }
    };

    /** NIEUW: Maakt het actiemenu met "Verwijder" optie */
    const createActionsDropdown = (songId, playlistId = null) => {
        let options = '';
        
        // Optie 1: Toevoegen aan playlist
        if (allPlaylists.length > 0) {
            options += allPlaylists.map(p => 
                `<a href="#" class="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 action-add-to-playlist" data-song-id="${songId}" data-playlist-id="${p.id}">Voeg toe aan '${p.name}'</a>`
            ).join('');
        } else {
            options += `<span class="block px-4 py-2 text-sm text-gray-500">Maak eerst een playlist</span>`;
        }
        
        options += `<div class="border-t border-gray-700 my-1"></div>`;

        // Optie 2: Verwijder uit *huidige* playlist
        if (playlistId) {
             options += `<a href="#" class="block px-4 py-2 text-sm text-yellow-400 hover:bg-yellow-500 hover:text-white action-remove-from-playlist" data-song-id="${songId}" data-playlist-id="${playlistId}">Verwijder uit deze playlist</a>`;
        }

        // NIEUW - Optie 3: Verwijder permanent
        options += `<a href="#" class="block px-4 py-2 text-sm text-red-400 hover:bg-red-500 hover:text-white action-delete-song" data-song-id="${songId}">Verwijder (permanent)</a>`;

        return `
            <div class="relative inline-block text-left dropdown">
                <button class="text-gray-500 hover:text-white p-1 rounded-full transition-colors"><i class="fas fa-ellipsis-v"></i></button>
                <div class="dropdown-menu absolute right-0 top-full mt-2 w-56 bg-gray-800 rounded-md shadow-lg z-20 hidden border border-gray-700">
                    <div class="py-1">
                        ${options}
                    </div>
                </div>
            </div>
        `;
    };
    
    const setActiveNav = (navElement) => {
        if (currentActiveNavItem) {
            currentActiveNavItem.classList.remove('text-white', 'font-semibold', 'bg-gray-800');
            currentActiveNavItem.classList.add('text-gray-300');
        }
        if (navElement) {
            navElement.classList.add('text-white', 'font-semibold', 'bg-gray-800');
            navElement.classList.remove('text-gray-300');
        }
        currentActiveNavItem = navElement;
    };
    
    // --- Data Laad Functies (API) ---

    const loadAllSongs = async () => {
        try {
            const response = await fetch('/api/songs');
            if (!response.ok) throw new Error('Kon nummers niet laden');
            allSongs = await response.json();
            
            allSongs.sort((a, b) => {
                if (!a.artist || !a.title) return 0; 
                if (a.artist.toLowerCase() < b.artist.toLowerCase()) return -1;
                if (a.artist.toLowerCase() > b.artist.toLowerCase()) return 1;
                return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
            });

            if (currentView.type === 'all-songs') {
                renderSongList(allSongs);
            }
        } catch (error) {
            console.error('Fout bij laden nummers:', error);
        }
    };

    const loadAllPlaylists = async () => {
        try {
            const response = await fetch('/api/playlists');
            if (!response.ok) throw new Error('Kon playlists niet laden');
            allPlaylists = await response.json();
            renderPlaylistList(allPlaylists);
        } catch (error) {
            console.error('Fout bij laden playlists:', error);
        }
    };
    
    const loadPlaylistDetails = async (playlistId, navElement) => {
        try {
            const response = await fetch(`/api/playlists/${playlistId}`);
            if (!response.ok) {
                 if(response.status === 404) {
                    alert("Playlist niet gevonden. Mogelijk verwijderd.");
                    await loadAllSongs();
                    await loadAllPlaylists();
                    showAllSongsView();
                 }
                throw new Error('Kon playlist details niet laden');
            }
            const playlist = await response.json();
            
            currentView.type = 'playlist';
            currentView.id = playlist.id;
            currentViewTitle.textContent = playlist.name;
            
            btnDeletePlaylist.classList.remove('hidden');
            
            setActiveNav(navElement);
            renderSongList(playlist.songs || []);
            
        } catch (error) {
            console.error('Fout bij laden playlist details:', error);
        }
    };
    
    const showAllSongsView = () => {
        currentView.type = 'all-songs';
        currentView.id = null;
        currentViewTitle.textContent = 'Alle Nummers';
        btnDeletePlaylist.classList.add('hidden');
        setActiveNav(navAllSongs);
        renderSongList(allSongs);
    };
    
    const pollDownloadStatus = async () => {
        try {
            const response = await fetch('/api/songs/status');
            if (!response.ok) return; 
            
            const pendingSongs = await response.json();
            renderDownloadStatus(pendingSongs);
            
            let viewNeedsUpdate = false;
            let newSongsAdded = false;

            allSongs.forEach(song => {
                const pendingVersion = pendingSongs.find(p => p.id === song.id);
                if (pendingVersion && song.status !== pendingVersion.status) {
                    Object.assign(song, pendingVersion); 
                    viewNeedsUpdate = true;
                }
            });
            
            pendingSongs.forEach(pendingSong => {
                if (!allSongs.find(s => s.id === pendingSong.id)) {
                    allSongs.push(pendingSong);
                    newSongsAdded = true;
                }
            });

            if (pendingSongs.length === 0 && downloadStatusContainer.children.length > 0) {
                await loadAllSongs();
                viewNeedsUpdate = true;
            }
            
            if (currentView.type === 'all-songs' && (viewNeedsUpdate || newSongsAdded)) {
                renderSongList(allSongs);
            } 
            else if (currentView.type === 'playlist' && viewNeedsUpdate) {
                const playlist = await (await fetch(`/api/playlists/${currentView.id}`)).json();
                renderSongList(playlist.songs || []);
            }

        } catch (error) {
            console.error('Fout bij pollen status:', error);
        }
    };

    // --- Render Functies (UI) ---

    /** Render de lijst met nummers in de tabel */
    const renderSongList = (songs) => {
        currentQueue = songs; 
        songListTbody.innerHTML = ''; 
        
        if (songs.length === 0) {
            songListTbody.innerHTML = '<tr><td colspan="5" class="px-5 py-6 text-center text-gray-500">Geen nummers in deze weergave.</td></tr>';
            return;
        }

        songs.forEach((song, index) => {
            const isPlaying = (currentSongIndex === index && !audioPlayer.paused);
            
            const tr = document.createElement('tr');
            tr.className = `group hover:bg-gray-800/50 ${isPlaying ? 'bg-green-800/20' : ''}`;
            
            let playIcon = 'fa-play';
            if(isPlaying) playIcon = 'fa-pause';
            
            // NIEUW: Standaard muzieknoot-icoon
            const iconHtml = song.thumbnail_url 
                ? `<img src="${song.thumbnail_url}" alt="Thumb" class="w-10 h-10 rounded-md bg-gray-800">`
                : `<div class="w-10 h-10 rounded-md bg-gray-700 flex items-center justify-center flex-shrink-0">
                       <i class="fas fa-music text-gray-400"></i>
                   </div>`;
            
            tr.innerHTML = `
                <td class="px-5 py-3 w-12">
                    <button class="play-song-btn text-lg ${isPlaying ? 'text-green-400' : 'text-gray-400 group-hover:text-white'}" data-index="${index}">
                        ${song.status === 'complete' ? `<i class="fas ${playIcon}"></i>` : ''}
                    </button>
                </td>
                <td class="px-5 py-3">
                    <div class="flex items-center space-x-3">
                        ${iconHtml}
                        <div>
                            <div class="font-medium text-white truncate max-w-sm">${song.title || 'Bezig...'}</div>
                            <div class="text-sm text-gray-500 truncate max-w-sm">${song.artist || '...'}</div>
                        </div>
                    </div>
                </td>
                <td class="px-5 py-3 text-sm text-gray-400 truncate max-w-xs">${song.album || (song.original_url ? 'Link' : 'Upload')}</td>
                <td class="px-5 py-3 text-sm text-gray-300">${getStatusIcon(song.status, song.error_message)}</td>
                <td class="px-5 py-3 text-sm text-right">
                    ${song.status === 'complete' ? createActionsDropdown(song.id, currentView.type === 'playlist' ? currentView.id : null) : ''}
                </td>
            `;
            songListTbody.appendChild(tr);
        });
    };

    /** Render de playlist in de sidebar */
    const renderPlaylistList = (playlists) => {
        playlistList.innerHTML = '';
        playlists.forEach(p => {
            const a = document.createElement('a');
            a.href = '#';
            a.className = 'flex items-center justify-between space-x-3 px-3 py-2 rounded-md hover:bg-gray-800 text-gray-300 transition-colors';
            a.dataset.playlistId = p.id;
            a.innerHTML = `
                <span class="truncate">${p.name}</span>
                <span class="text-xs text-gray-500">${p.song_count}</span>
            `;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                loadPlaylistDetails(p.id, a);
            });
            playlistList.appendChild(a);
        });
    };
    
    /** Render de 'downloading' items */
    const renderDownloadStatus = (pendingSongs) => {
        downloadStatusContainer.innerHTML = '';
        if (pendingSongs.length === 0) return;
        
        pendingSongs.forEach(song => {
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between p-2.5 bg-gray-700/50 rounded-md border border-gray-700';
            div.innerHTML = `
                <div class="flex items-center space-x-2 overflow-hidden">
                    <span class="flex-shrink-0">${getStatusIcon(song.status)}</span>
                    <span class="truncate text-gray-300">${song.title || song.original_url}</span>
                </div>
            `;
            downloadStatusContainer.appendChild(div);
        });
    };

    // --- Player Logica ---
    
    /** Initialiseer de Web Audio API (moet na een user-klik) */
    const initAudioApi = () => {
        if (isAudioApiInit) return;
        
        console.log("Audio API initialiseren...");
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Maak de compressor (normalisatie)
        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-40, audioCtx.currentTime); // db
        compressor.knee.setValueAtTime(30, audioCtx.currentTime);      // db
        compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0, audioCtx.currentTime);     // s
        compressor.release.setValueAtTime(0.25, audioCtx.currentTime); // s

        // Koppel de <audio> tag aan de API
        audioSource = audioCtx.createMediaElementSource(audioPlayer);
        
        // Route: Audio Source -> Compressor -> Output (speakers)
        audioSource.connect(compressor).connect(audioCtx.destination);
        isAudioApiInit = true;
    };
    
    const playSong = (index) => {
        if (index < 0 || index >= currentQueue.length) return;
        
        const song = currentQueue[index];
        if (song.status !== 'complete' || !song.file_path) {
            playNext(); 
            return;
        }

        currentSongIndex = index;
        audioPlayer.src = `/api/stream/${song.id}`; 
        audioPlayer.play();

        // NIEUW: Update player thumbnail met standaard icoon
        playerThumbnail.src = song.thumbnail_url || 'https://via.placeholder.com/56/1f2937/10b981?text=?';
        if (!song.thumbnail_url) {
            // Als er geen thumbnail is, kunnen we de placeholder niet tonen
            // (Dit is een beperking, we laten de oude staan of tonen een 'leeg' blok)
            // Laten we de 'via.placeholder' gebruiken als standaard
        }
        playerTitle.textContent = song.title;
        playerArtist.textContent = song.artist;
        
        btnPrev.disabled = (currentSongIndex === 0);
        btnNext.disabled = (currentSongIndex === currentQueue.length - 1);
        
        renderSongList(currentQueue);
    };

    const togglePlayPause = () => {
        // NIEUW: Start de Audio API bij de eerste keer afspelen
        if (!isAudioApiInit) {
            initAudioApi();
        }
        // Browsers vereisen soms een 'resume' na user input
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        if (audioPlayer.paused) {
            if (currentSongIndex === -1 && currentQueue.length > 0) {
                playSong(0);
            } else {
                audioPlayer.play();
            }
        } else {
            audioPlayer.pause();
        }
    };
    
    const playNext = () => {
        if (currentSongIndex < currentQueue.length - 1) {
            playSong(currentSongIndex + 1);
        } else {
            audioPlayer.pause();
            currentSongIndex = -1;
            renderSongList(currentQueue);
        }
    };

    const playPrev = () => {
        if (audioPlayer.currentTime > 3) {
            audioPlayer.currentTime = 0;
        } else if (currentSongIndex > 0) {
            playSong(currentSongIndex - 1);
        }
    };

    // --- Event Handlers ---

    btnPlayPause.addEventListener('click', togglePlayPause);
    btnNext.addEventListener('click', playNext);
    btnPrev.addEventListener('click', playPrev);

    audioPlayer.addEventListener('play', () => {
        iconPlayPause.classList.remove('fa-play');
        iconPlayPause.classList.add('fa-pause');
        renderSongList(currentQueue);
    });
    audioPlayer.addEventListener('pause', () => {
        iconPlayPause.classList.remove('fa-pause');
        iconPlayPause.classList.add('fa-play');
        renderSongList(currentQueue);
    });
    audioPlayer.addEventListener('ended', playNext);
    audioPlayer.addEventListener('timeupdate', () => {
        const percentage = (audioPlayer.currentTime / audioPlayer.duration) * 100 || 0;
        playerSeeker.value = audioPlayer.currentTime;
        playerCurrentTime.textContent = formatTime(audioPlayer.currentTime);
        playerSeeker.style.background = `linear-gradient(to right, #10b981 ${percentage}%, #374151 ${percentage}%)`;
    });
    audioPlayer.addEventListener('loadedmetadata', () => {
        playerDuration.textContent = formatTime(audioPlayer.duration);
        playerSeeker.max = audioPlayer.duration;
    });

    playerSeeker.addEventListener('input', () => {
        audioPlayer.currentTime = playerSeeker.value;
    });
    
    /** NIEUW: Helper om volume slider + icoon bij te werken */
    const updateVolumeSliderVisual = (value) => {
        const volume = value / 100;
        
        if (volume === 0) {
            volumeIcon.className = 'fas fa-volume-mute text-gray-400';
        } else if (volume < 0.5) {
            volumeIcon.className = 'fas fa-volume-low text-gray-400';
        } else {
            volumeIcon.className = 'fas fa-volume-high text-gray-400';
        }
        playerVolume.style.background = `linear-gradient(to right, #ffffff ${value}%, #374151 ${value}%)`;
    };

    playerVolume.addEventListener('input', () => {
        const volumeValue = playerVolume.value;
        audioPlayer.volume = volumeValue / 100;
        updateVolumeSliderVisual(volumeValue);
        
        // NIEUW: Sla volume op
        localStorage.setItem('musicHubVolume', volumeValue);
    });

    // --- Dropdown Actie Handlers ---
    songListTbody.addEventListener('click', (e) => {
        const playButton = e.target.closest('.play-song-btn');
        if (playButton) {
            const index = parseInt(playButton.dataset.index);
            if (index === currentSongIndex) togglePlayPause();
            else playSong(index);
            return;
        }

        const dropdownButton = e.target.closest('.dropdown > button');
        if (dropdownButton) {
            e.stopPropagation();
            document.querySelectorAll('.dropdown-menu').forEach(m => {
                if (m !== dropdownButton.nextElementSibling) m.classList.add('hidden');
            });
            dropdownButton.nextElementSibling.classList.toggle('hidden');
            return;
        }

        const addBtn = e.target.closest('.action-add-to-playlist');
        if (addBtn) {
            e.preventDefault();
            handleAddSongToPlaylist(addBtn.dataset.playlistId, addBtn.dataset.songId);
            addBtn.closest('.dropdown-menu').classList.add('hidden');
            return;
        }
        
        const removeBtn = e.target.closest('.action-remove-from-playlist');
        if (removeBtn) {
            e.preventDefault();
            handleRemoveSongFromPlaylist(removeBtn.dataset.playlistId, removeBtn.dataset.songId);
            removeBtn.closest('.dropdown-menu').classList.add('hidden');
            return;
        }
        
        // NIEUW: Handler voor verwijderen
        const deleteBtn = e.target.closest('.action-delete-song');
        if (deleteBtn) {
            e.preventDefault();
            handleDeleteSong(deleteBtn.dataset.songId);
            deleteBtn.closest('.dropdown-menu').classList.add('hidden');
            return;
        }
    });
    
    document.body.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
        }
    }, true);


    navAllSongs.addEventListener('click', (e) => {
        e.preventDefault();
        showAllSongsView();
    });
    
    btnDeletePlaylist.addEventListener('click', async (e) => {
        const playlistId = currentView.id;
        if (!playlistId) return;
        
        const playlist = allPlaylists.find(p => p.id === playlistId);
        if(!confirm(`Weet je zeker dat je de playlist "${playlist.name}" wilt verwijderen?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error("Kon playlist niet verwijderen");
            await loadAllPlaylists();
            showAllSongsView();
        } catch (error) {
            console.error('Fout bij verwijderen playlist:', error);
            alert(error.message);
        }
    });

    // --- Formulier Handlers (API POST) ---

    formAddSong.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = inputAddUrl.value.trim();
        if (!url) return;
        inputAddUrl.disabled = true;
        try {
            const body = new URLSearchParams();
            body.append('url', url);
            const response = await fetch('/api/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body
            });
            if (!response.ok) { const error = await response.json(); throw new Error(error.detail || 'Fout bij toevoegen'); }
            const newSong = await response.json();
            if (!allSongs.find(s => s.id === newSong.id)) allSongs.push(newSong);
            else { const index = allSongs.findIndex(s => s.id === newSong.id); allSongs[index] = newSong; }
            if (currentView.type === 'all-songs') renderSongList(allSongs);
            pollDownloadStatus();
            inputAddUrl.value = '';
        } catch (error) {
            alert(`Fout: ${error.message}`);
        } finally {
            inputAddUrl.disabled = false;
        }
    });

    formUploadMp3.addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = inputUploadFile.files[0];
        if (!file) return;
        btnUploadSubmit.disabled = true;
        btnUploadSubmit.textContent = "Bezig...";
        const formData = new FormData();
        formData.append('mp3file', file);
        try {
            const response = await fetch('/api/upload', { method: 'POST', body: formData });
            if (!response.ok) { const error = await response.json(); throw new Error(error.detail || 'Fout bij uploaden'); }
            const newSong = await response.json();
            allSongs.push(newSong);
            if (currentView.type === 'all-songs') renderSongList(allSongs);
            inputUploadFile.value = '';
        } catch (error) {
            alert(`Fout: ${error.message}`);
        } finally {
            btnUploadSubmit.disabled = false;
            btnUploadSubmit.textContent = "Uploaden";
        }
    });
    
    formCreatePlaylist.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = inputNewPlaylist.value.trim();
        if (!name) return;
        inputNewPlaylist.disabled = true;
        try {
            const body = new URLSearchParams(); body.append('name', name);
            const response = await fetch('/api/playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body
            });
            if (!response.ok) { const error = await response.json(); throw new Error(error.detail || 'Fout bij maken playlist'); }
            const newPlaylist = await response.json();
            allPlaylists.push(newPlaylist);
            renderPlaylistList(allPlaylists);
            inputNewPlaylist.value = '';
        } catch (error) {
            alert(error.message);
        } finally {
            inputNewPlaylist.disabled = false;
        }
    });

    const handleAddSongToPlaylist = async (playlistId, songId) => {
        try {
            const response = await fetch(`/api/playlists/${playlistId}/add/${songId}`, { method: 'POST' });
            if (!response.ok) { const error = await response.json(); throw new Error(error.detail || 'Kon nummer niet toevoegen'); }
            await loadAllPlaylists(); 
        } catch (error) {
            alert(error.message);
        }
    };
    
    const handleRemoveSongFromPlaylist = async (playlistId, songId) => {
        try {
            const response = await fetch(`/api/playlists/${playlistId}/remove/${songId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Kon nummer niet verwijderen uit playlist');
            const updatedPlaylist = await response.json();
            renderSongList(updatedPlaylist.songs); 
            await loadAllPlaylists(); 
        } catch (error) {
            alert(error.message);
        }
    };
    
    /** NIEUW: Handler voor permanent verwijderen */
    const handleDeleteSong = async (songId) => {
        const song = allSongs.find(s => s.id == songId);
        if (!song) return;
        
        if (!confirm(`Weet je zeker dat je "${song.title}" permanent wilt verwijderen? Dit kan niet ongedaan gemaakt worden.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/songs/${songId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Kon nummer niet verwijderen');
            
            // Verwijder uit alle lokale lijsten
            allSongs = allSongs.filter(s => s.id != songId);
            currentQueue = currentQueue.filter(s => s.id != songId);
            
            // Herlaad de huidige view
            renderSongList(currentQueue);
            // Herlaad playlists (voor song count)
            await loadAllPlaylists();

        } catch (error) {
            alert(error.message);
        }
    };


    // --- Initialisatie ---
    const init = async () => {
        // NIEUW: Laad opgeslagen volume
        const savedVolume = localStorage.getItem('musicHubVolume') || 80;
        playerVolume.value = savedVolume;
        audioPlayer.volume = savedVolume / 100;
        updateVolumeSliderVisual(savedVolume);
        
        await Promise.all([ loadAllSongs(), loadAllPlaylists() ]);
        showAllSongsView();
        
        setInterval(pollDownloadStatus, 5000); 
        pollDownloadStatus(); 
    };

    init();
});