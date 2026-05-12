<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Ticket - {{ $ticketCode }}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .ticket { border: 2px solid #333; border-radius: 10px; padding: 20px; max-width: 400px; }
        .header { text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 15px; margin-bottom: 15px; }
        .event-title { font-size: 18px; font-weight: bold; color: #1976d2; }
        .qr-section { text-align: center; margin: 15px 0; }
        .info-section { margin-top: 10px; }
        .info-row { display: flex; margin: 5px 0; font-size: 12px; }
        .info-label { width: 80px; font-weight: bold; }
        .info-value { flex: 1; }
        .footer { text-align: center; margin-top: 15px; font-size: 10px; color: #666; }
    </style>
</head>
<body>
    <div class="ticket">
        <div class="header">
            <div class="event-title">{{ $event->title }}</div>
            <div style="margin-top: 5px;">{{ $event->location }}</div>
        </div>
        <div class="qr-section">
            <img src="data:image/png;base64,{{ $qrCode }}" alt="QR Code" style="width: 150px; height: 150px;">
        </div>
        <div class="info-section">
            <div class="info-row">
                <span class="info-label">Name:</span>
                <span class="info-value">{{ $attendee->name }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Email:</span>
                <span class="info-value">{{ $attendee->email }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Ticket:</span>
                <span class="info-value">{{ $attendee->ticket_name }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Code:</span>
                <span class="info-value"><strong>{{ $attendee->ticket_code }}</strong></span>
            </div>
            <div class="info-row">
                <span class="info-label">Date:</span>
                <span class="info-value">{{ \Carbon\Carbon::parse($event->start_time)->format('M d, Y H:i') }}</span>
            </div>
        </div>
        <div class="footer">
            <p>This is your official e-ticket. Please present this at the event entrance.</p>
        </div>
    </div>
</body>
</html>
