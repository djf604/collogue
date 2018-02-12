var dp;
$(function() {
    var $createEventDialogue = $('#create-event-dialogue'),
        $editEventDialogue = $('#edit-event-dialogue'),
        $dialogueUnderlay = $('#hidden-drawer-underlay'),
        $roomSelect = $('#room-select'),
        loadedWeeks = [];

    /*
     * Convenience methods on the dialogue boxes
     */
    $editEventDialogue.open = $createEventDialogue.open =function() {
        this.css('transform', 'translate(0, -100%)').data('state', 'open');
        $dialogueUnderlay.css('transform', 'translate(0, 100%)');
        return this;
    };
    $editEventDialogue.close = $createEventDialogue.close = function() {
        this.css('transform', 'translate(0, 0)').data('state', 'closed');
        $dialogueUnderlay.css('transform', 'translate(0, 0)');
        return this;
    };
    $createEventDialogue.clearForms = function() {
        this.find('input, textarea').each(function() {
            this.value = '';
        });
        return this;
    };
    $createEventDialogue.populateForms = function(options) {
        $.each(options, function(key, value) {
            $createEventDialogue.find('input.' + key).val(value);
        });
    };

    /*
     * Initializes the DayPilot.Calendar instance.
     */
    function initCalendar(calId, loadedWeeks) {
        // Initialize calendar instance
        var cal = new DayPilot.Calendar(calId);
        cal.viewType = 'Week';
        // cal.theme = 'calendar_green';

        // Attach event handlers
        cal.onEventClick = function(args) {
            $editEventDialogue.open();
            $editEventDialogue.find('span.title').text(args.e.data.text.split('</b>')[0].substring(3));
            $editEventDialogue.find('button').data('pk', args.e.data.id);
        };
        cal.onTimeRangeSelected = function(args) {
            cal.clearSelection();
            $createEventDialogue.open().clearForms().populateForms({
                'event-start': args.start.toString(),
                'event-end': args.end.toString()
            });
            $createEventDialogue.find('input.event-name').focus();
        };
        cal.init();

        // Clear out the loadedWeeks array
        while(loadedWeeks.length) loadedWeeks.pop();
        return cal;
    }

    /*
     * Adds a week's reservations to the calendar. If the proposed week is contained in the
     * provided Array loadedWeeks, this function returns immediately.
     */
    function addWeekReservations(startDate, roomPk, loadedWeeks, loaderId) {
        // Check to ensure this week hasn't already been loaded
        var firstDayOfWeek = startDate.firstDayOfWeek();
        if (loadedWeeks.includes(firstDayOfWeek.toString() + '_' + roomPk)) return;

        // Get range and GET request URL
        var lastDayOfWeek = firstDayOfWeek.addDays(6);
        var getReservationsUrl = getResUrl + firstDayOfWeek.toString().split('T')[0] + '/' +
                                 lastDayOfWeek.toString().split('T')[0] + '/' + roomPk + '/';

        // Get Reservations for this week
        $(loaderId).show();
        $.get(getReservationsUrl, function(data) {
            // Add each reservation to the calendar
            $.each(JSON.parse(data), function(i, reservationData) {
                dp.events.add(new DayPilot.Event(reservationData));
            });

            // Add week to weeks already loaded, hide loader
            loadedWeeks.push(firstDayOfWeek.toString() + '_' + roomPk);
            $(loaderId).hide();
        });
    }

    /*
     * Display a message in a very simple way for a specified duration.
     */
    function displayMessage(message, duration) {
        $('#message').text(message);
        window.setTimeout(function() {
            $('#message').empty();
        }, duration || 4000);
    }

    /*
     * Click event handler, creates a Reservation in the application
     */
    $createEventDialogue.find('button.event-create-btn').click(function() {
        var start = $createEventDialogue.find('input.event-start').val();
        var end = $createEventDialogue.find('input.event-end').val();
        var name = $createEventDialogue.find('input.event-name').val();
        var description = $createEventDialogue.find('textarea').val();
        var roomPk = $roomSelect.val();

        // Register reservation with the server
        $.get(addResUrl, {
            start_time: start,
            end_time: end,
            name: name,
            description: description,
            room: roomPk
        }, function(rawData) {
            var data = JSON.parse(rawData);
            if (data.result === 'success') {
                dp.events.add(new DayPilot.Event({
                    start: start,
                    end: end,
                    id: data.id,
                    text: '<b>' + name + ' (Unapproved)</b><br/>' + description,
                    backColor: '#F4DFB7',
                    borderColor: 'transparent'
                }));
                displayMessage('Reservation added successfully.');
            } else {
                displayMessage('Error adding reservation.');
                console.log(data.error);
            }
        });

        // Reset dialogue
        $createEventDialogue.close().clearForms();
    });

    /*
     * Click event handler for the delete button in the edit reservation
     * dialogue box. Based on the event clicked in the DayPilot calendar, will
     * report that ID to the server and attempt to delete from the database. If
     * that is successful, will also remove the reservation from the calendar.
     */
    $editEventDialogue.find('button').click(function() {
        // Store the pk, which is set when the reservation is clicked
        var pk = Number($(this).data('pk'));

        // Delete reservation from the server
        $.get(deleteResUrl + pk + '/', function(rawData) {
            var data = JSON.parse(rawData);
            if (data.result === 'success') {
                displayMessage('Reservation deleted.');

                // Iterate through reservations until we have an ID match
                $.each(dp.events.list, function(i, event) {
                    if (event.id === pk) {
                        // Remove event from list and break out of $.each()
                        dp.events.list.splice(i, 1);
                        dp.update();
                        return false;
                    }
                });
            } else {
                displayMessage('Error deleting reservation.');
                console.log(data.error);
            }

            // Close the edit reservation dialogue box
            $editEventDialogue.close();
        });
    });

    /*
     * Change event handler for the room select dropdown. Loads a new calendar and fetches
     * reservations for the new room.
     */
    $roomSelect.change(function() {
        dp = initCalendar('cal', loadedWeeks);
        addWeekReservations(dp.startDate, $(this).val(), loadedWeeks, '#loading-res');
    }).change();

    /*
     * Click event handler for the week navigation buttons
     */
    $('button.date-nav').click(function() {
        dp.startDate = dp.startDate.addDays(Number($(this).data('add')));
        dp.update();
        addWeekReservations(dp.startDate, $roomSelect.val(), loadedWeeks, '#loading-res');
    });

    /*
     * Click event handler for the 'Add Reservation' button
     */
    $('#add-res').click(function() {
        $createEventDialogue.open();
    });

    /*
     * Click event handler for the dialogue box overlay, closes the
     * dialogue when clicked.
     */
    $dialogueUnderlay.click(function() {
        $createEventDialogue.close();
        $editEventDialogue.close();
    });

    /*
     * Button to close the Reservation Creation dialogue box
     */
    $('span.close-dialogue').click(function() {
        $createEventDialogue.close();
        $editEventDialogue.close();
    });
});