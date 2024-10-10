$(document).ready(function() {
    const socket = io();

    let currentRoom = null;
    let username = null;
    let bingoCard = [];
    let cardSaved = false;

    socket.on('loggedIn', (user) => {
        username = user;
        $('#auth-section').hide();
        $('#main-section').removeClass('d-none');
        $('#logout-btn').removeClass('d-none');

        socket.emit('getRankings');
    });

    socket.on('loggedOut', () => {
        username = null;
        location.reload();
    });

    $('#register-btn').click(() => {
        username = $('#auth-username').val().trim();
        const password = $('#auth-password').val().trim();
        if (username && password) {
            socket.emit('register', { username, password });
        } else {
            $('#auth-error').text('Proszę wpisać nazwę użytkownika i hasło.');
        }
    });

    socket.on('registerSuccess', (message) => {
        $('#auth-error').css('color', 'green').text(message);
    });

    socket.on('registerError', (message) => {
        $('#auth-error').css('color', 'red').text(message);
    });

    $('#login-btn').click(() => {
        username = $('#auth-username').val().trim();
        const password = $('#auth-password').val().trim();
        if (username && password) {
            socket.emit('login', { username, password });
        } else {
            $('#auth-error').text('Proszę wpisać nazwę użytkownika i hasło.');
        }
    });

    $('#logout-btn').click(() => {
        socket.emit('logout');
    });

    socket.on('loginError', (message) => {
        $('#auth-error').css('color', 'red').text(message);
    });

    socket.on('loadBingoCard', (savedBingoCard) => {
        bingoCard = savedBingoCard;
        cardSaved = true;
    });

    $('#create-room-btn').click(() => {
        const roomName = $('#room-name').val().trim();
        const roomPassword = $('#room-password').val().trim();
        if (roomName && roomPassword) {
            socket.emit('createRoom', { roomName, roomPassword });
        } else {
            alert('Proszę wpisać nazwę pokoju i hasło.');
        }
    });

    $('#join-room-btn').click(() => {
        const roomName = $('#room-name').val().trim();
        const roomPassword = $('#room-password').val().trim();
        if (roomName && roomPassword) {
            socket.emit('joinRoom', { roomName, roomPassword });
        } else {
            alert('Proszę wpisać nazwę pokoju i hasło.');
        }
    });

    socket.on('roomCreated', (roomName) => {
        currentRoom = roomName;
        initBingoSection();
    });

    socket.on('roomJoined', (roomName, winner) => {
        currentRoom = roomName;
        initBingoSection();
        if (winner) {
            $('#bingo-status').text(`Bingo zostało już wygrane przez ${winner.username}.`);
            displayWinningCard(winner);
        } else {
            $('#bingo-status').text('');
        }
    });

    socket.on('chatHistory', (history) => {
        $('#chat-window').empty();
        history.forEach(data => {
            $('#chat-window').append(`<div><strong>${data.username}:</strong> ${data.message}</div>`);
        });
        $('#chat-window').scrollTop($('#chat-window')[0].scrollHeight);
    });

    socket.on('error', (message) => {
        alert(message);
    });

    function initBingoSection() {
        $('#room-section').hide();
        $('#bingo-section').removeClass('d-none');
        if (!cardSaved) {
            initBingoCard();
        } else {
            renderBingoCard();
        }
    }

    function initBingoCard() {
        bingoCard = Array(9).fill('');
        renderBingoCard();
        $('#save-card-btn').removeClass('d-none');
        $('#reset-btn').addClass('d-none');
        $('#delete-card-btn').addClass('d-none');
    }

    function renderBingoCard() {
        const bingoCardTable = $('#bingo-card');
        bingoCardTable.empty();
        let index = 0;
        for (let row = 0; row < 3; row++) {
            const tr = $('<tr></tr>');
            for (let col = 0; col < 3; col++) {
                let td;
                if (!cardSaved) {
                    td = $(`
                        <td class="bingo-cell" data-index="${index}">
                            <textarea class="form-control h-100" data-index="${index}" placeholder="Wpisz tekst">${bingoCard[index]}</textarea>
                        </td>
                    `);
                    td.find('textarea').on('input', function() {
                        const idx = $(this).data('index');
                        bingoCard[idx] = $(this).val();
                    });
                } else {
                    td = $(`
                        <td class="bingo-cell" data-index="${index}">
                            <div class="cell-text">${bingoCard[index]}</div>
                        </td>
                    `);
                    td.click(function() {
                        if ($('#bingo-status').text() === '') {
                            $(this).toggleClass('selected');
                            checkForBingo();
                        } else {
                            alert('Bingo zostało już wygrane w tym pokoju.');
                        }
                    });
                }
                tr.append(td);
                index++;
            }
            bingoCardTable.append(tr);
        }
        if (cardSaved) {
            $('#save-card-btn').addClass('d-none');
            $('#reset-btn').removeClass('d-none');
            $('#delete-card-btn').removeClass('d-none');
        } else {
            $('#save-card-btn').removeClass('d-none');
            $('#reset-btn').addClass('d-none');
            $('#delete-card-btn').addClass('d-none');
        }
    }

    $('#save-card-btn').click(() => {
        if (bingoCard.includes('')) {
            alert('Proszę wypełnić wszystkie pola na karcie.');
            return;
        }
        socket.emit('saveBingoCard', bingoCard);
    });

    socket.on('bingoCardSaved', () => {
        cardSaved = true;
        renderBingoCard();
    });

    $('#delete-card-btn').click(() => {
        if (confirm('Czy na pewno chcesz usunąć swoją kartę Bingo?')) {
            socket.emit('deleteBingoCard');
        }
    });

    socket.on('bingoCardDeleted', () => {
        cardSaved = false;
        initBingoCard();
    });

    function checkForBingo() {
        const selectedCells = [];
        $('.bingo-cell').each(function(index) {
            if ($(this).hasClass('selected')) {
                selectedCells.push(index);
            }
        });

        const winningCombinations = [
            [0,1,2],
            [3,4,5],
            [6,7,8],
            [0,3,6],
            [1,4,7],
            [2,5,8],
            [0,4,8],
            [2,4,6]
        ];

        for (let combo of winningCombinations) {
            if (combo.every(index => selectedCells.includes(index))) {
                socket.emit('bingo', currentRoom, selectedCells);
                break;
            }
        }
    }

    $('#reset-btn').click(() => {
        $('.bingo-cell').removeClass('selected');
    });

    socket.on('bingo', (data) => {
        const { message, winner } = data;
        alert(message);
        $('#bingo-status').text(message);

        displayWinningCard(winner);
    });

    function displayWinningCard(winner) {
        const { username, card, selectedCells } = winner;

        const modalHtml = `
        <div class="modal fade" id="winningCardModal" tabindex="-1" aria-labelledby="winningCardModalLabel" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="winningCardModalLabel">Wygrana karta Bingo - ${username}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Zamknij"></button>
              </div>
              <div class="modal-body">
                <table class="table table-bordered text-center">
                  ${generateWinningCardTable(card, selectedCells)}
                </table>
              </div>
            </div>
          </div>
        </div>
        `;

        if ($('#winningCardModal').length > 0) {
            $('#winningCardModal').remove();
        }

        $('body').append(modalHtml);

        const winningCardModal = new bootstrap.Modal(document.getElementById('winningCardModal'));
        winningCardModal.show();

        $('#winningCardModal').on('hidden.bs.modal', function () {
            $(this).remove();
        });
    }

    function generateWinningCardTable(card, selectedCells) {
        let html = '';
        let index = 0;
        for (let row = 0; row < 3; row++) {
            html += '<tr>';
            for (let col = 0; col < 3; col++) {
                const cellText = card[index];
                const isSelected = selectedCells.includes(index);
                html += `<td class="${isSelected ? 'bg-success text-white' : ''}">${cellText}</td>`;
                index++;
            }
            html += '</tr>';
        }
        return html;
    }

    socket.on('bingoAlreadyWon', (message) => {
        alert(message);
    });

    socket.on('updateUsers', (users, winner) => {
        const userList = $('#user-list');
        userList.empty();
        users.forEach(user => {
            if (user === winner) {
                userList.append(`<li class="list-group-item">${user} <strong>(Wygrał(a) Bingo!)</strong></li>`);
            } else {
                userList.append(`<li class="list-group-item">${user}</li>`);
            }
        });
        if (winner) {
            $('#bingo-status').text(`Bingo zostało już wygrane przez ${winner}.`);
        } else {
            $('#bingo-status').text('');
        }
    });

    $('#send-chat-btn').click(() => {
        const message = $('#chat-input').val().trim();
        if (message) {
            socket.emit('chatMessage', currentRoom, message);
            $('#chat-input').val('');
        }
    });

    socket.on('chatMessage', (data) => {
        $('#chat-window').append(`<div><strong>${data.username}:</strong> ${data.message}</div>`);
        $('#chat-window').scrollTop($('#chat-window')[0].scrollHeight);
    });

    socket.on('rankingsData', (rankings) => {
        displayRankings(rankings);
    });

    function displayRankings(rankings) {
        const rankingsList = $('#rankings-list');
        rankingsList.empty();
        let rank = 1;
        rankings.forEach(user => {
            rankingsList.append(`
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${rank}. ${user.username}</span>
                    <span class="badge bg-primary rounded-pill">${user.wins} wygrane</span>
                </li>
            `);
            rank++;
        });
    }
});