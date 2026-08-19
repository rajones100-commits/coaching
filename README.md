# W2W Coaching Dashboard — Single Google Sheet Version

This version reads directly from one published Google Sheet CSV. There is no Apps Script and no Google Calendar connection.

## Your live data source
The published CSV URL is already set in `config.js`.

## Recommended spreadsheet headings
The app is deliberately flexible and recognises common variations. For best results use:

Date | Start Time | End Time | Player | Session Type | Fee | Paid? | Payment Method | Session Focus | Notes

Optional player information can be repeated on session rows:
Age Group | Parent / Guardian | Phone | Email | Batting | Bowling

`Paid?` can contain Yes/No, Paid, True/False, or 1/0.

Dates are best entered as DD/MM/YYYY and fees as numbers or £ amounts.

## GitHub Pages
Upload `index.html`, `styles.css`, `app.js` and `config.js` to the root of your GitHub repository, then enable GitHub Pages for the repository.

When the Google Sheet changes, press Refresh in the dashboard or reload the page.

## Important
The Google Sheet must remain published to the web as CSV for the site to read it. Anyone with the published CSV URL can technically read the data, so avoid putting sensitive personal information such as private phone numbers, home addresses or confidential safeguarding/medical notes in a public spreadsheet.
