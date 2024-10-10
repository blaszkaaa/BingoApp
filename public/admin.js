$(document).ready(function() {
    let usersData = {};
    let roomsData = [];
    let bannedData = {};

    function loadData() {
        $.get('/admin/data', function(data) {
            usersData = data.users;
            roomsData = data.activeRooms;
            bannedData = data.banned;
            // Update Users Tab
            updateUserList();
            // Update Rooms Tab
            updateRoomList();
            // Update Stats Tab
            $('#stats-data').text(JSON.stringify(data.stats, null, 2));
            // Update Logs Tab
            $('#logs-data').text(data.logs);
        });
    }

    function updateUserList() {
        const userList = $('#user-list');
        userList.empty();
        for (let username in usersData) {
            const isBanned = bannedData[username] ? true : false;
            const listItem = $(`
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    ${username} ${isBanned ? '<span class="badge bg-danger ms-2">Zbanowany</span>' : ''}
                    <div>
                        <button class="btn btn-sm btn-primary me-2 reset-password-btn" data-username="${username}">Resetuj hasło</button>
                        <button class="btn btn-sm ${isBanned ? 'btn-success unban-user-btn' : 'btn-danger ban-user-btn'}" data-username="${username}">
                            ${isBanned ? 'Odblokuj' : 'Zbanuj'}
                        </button>
                        <button class="btn btn-sm btn-danger delete-user-btn ms-2" data-username="${username}">Usuń</button>
                    </div>
                </li>
            `);
            userList.append(listItem);
        }
    }

    function updateRoomList() {
        const roomList = $('#room-list');
        roomList.empty();
        roomsData.forEach(room => {
            const listItem = $(`
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    ${room.roomName} (Użytkownicy: ${room.userCount})
                    <button class="btn btn-sm btn-danger close-room-btn" data-roomname="${room.roomName}">Zamknij</button>
                </li>
            `);
            roomList.append(listItem);
        });
    }

    // Delete User
    $(document).on('click', '.delete-user-btn', function() {
        const username = $(this).data('username');
        if (confirm(`Czy na pewno chcesz usunąć użytkownika ${username}?`)) {
            $.post('/admin/deleteUser', { username }, function(response) {
                if (response.success) {
                    loadData();
                } else {
                    alert(response.message);
                }
            });
        }
    });

    // Reset Password
    $(document).on('click', '.reset-password-btn', function() {
        const username = $(this).data('username');
        $('#reset-password-username').val(username);
        $('#new-password').val('');
        const modal = new bootstrap.Modal(document.getElementById('resetPasswordModal'));
        modal.show();
    });

    $('#confirm-reset-password-btn').click(function() {
        const username = $('#reset-password-username').val();
        const newPassword = $('#new-password').val();
        if (newPassword) {
            $.post('/admin/resetPassword', { username, newPassword }, function(response) {
                if (response.success) {
                    alert('Hasło zostało zresetowane.');
                    $('#resetPasswordModal').modal('hide');
                } else {
                    alert(response.message);
                }
            });
        } else {
            alert('Proszę wprowadzić nowe hasło.');
        }
    });

    // Ban User
    $(document).on('click', '.ban-user-btn', function() {
        const username = $(this).data('username');
        $('#ban-username').val(username);
        $('#ban-username-display').text(username);
        const modal = new bootstrap.Modal(document.getElementById('banUserModal'));
        modal.show();
    });

    // Unban User
    $(document).on('click', '.unban-user-btn', function() {
        const username = $(this).data('username');
        $('#unban-username').val(username);
        $('#unban-username-display').text(username);
        const modal = new bootstrap.Modal(document.getElementById('unbanUserModal'));
        modal.show();
    });

    $('#confirm-ban-user-btn').click(function() {
        const username = $('#ban-username').val();
        $.post('/admin/banUser', { username }, function(response) {
            if (response.success) {
                alert(`Użytkownik ${username} został zbanowany.`);
                $('#banUserModal').modal('hide');
                loadData();
            } else {
                alert(response.message);
            }
        });
    });

    $('#confirm-unban-user-btn').click(function() {
        const username = $('#unban-username').val();
        $.post('/admin/unbanUser', { username }, function(response) {
            if (response.success) {
                alert(`Użytkownik ${username} został odblokowany.`);
                $('#unbanUserModal').modal('hide');
                loadData();
            } else {
                alert(response.message);
            }
        });
    });

    // Reset Stats
    $('#reset-stats-btn').click(function() {
        if (confirm('Czy na pewno chcesz zresetować statystyki wszystkich użytkowników?')) {
            $.post('/admin/resetStats', function(response) {
                if (response.success) {
                    loadData();
                    alert('Statystyki zostały zresetowane.');
                } else {
                    alert('Wystąpił błąd podczas resetowania statystyk.');
                }
            });
        }
    });

    // Close Room
    $(document).on('click', '.close-room-btn', function() {
        const roomName = $(this).data('roomname');
        if (confirm(`Czy na pewno chcesz zamknąć pokój ${roomName}?`)) {
            $.post('/admin/closeRoom', { roomName }, function(response) {
                if (response.success) {
                    loadData();
                    alert(`Pokój ${roomName} został zamknięty.`);
                } else {
                    alert(response.message);
                }
            });
        }
    });

    // Send Broadcast Message
    $('#send-broadcast-btn').click(function() {
        const message = $('#broadcast-message').val().trim();
        if (message) {
            $.post('/admin/broadcastMessage', { message }, function(response) {
                if (response.success) {
                    alert('Wiadomość została wysłana do wszystkich użytkowników.');
                    $('#broadcast-message').val('');
                } else {
                    alert('Wystąpił błąd podczas wysyłania wiadomości.');
                }
            });
        } else {
            alert('Proszę wprowadzić treść wiadomości.');
        }
    });

    // Export Data
    $('#export-data-btn').click(function() {
        const format = $('#export-format').val();
        if (format === 'csv') {
            window.location.href = '/admin/exportData';
        } else if (format === 'json') {
            $.get('/admin/data', function(data) {
                const jsonStr = JSON.stringify(data, null, 2);
                const blob = new Blob([jsonStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'app_data.json';
                a.click();
                URL.revokeObjectURL(url);
            });
        }
    });

    // Initial Data Load
    loadData();
});