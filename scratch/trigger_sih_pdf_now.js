const fs = require('fs');
const path = require('path');

async function sendSihPdfNow() {
  console.log('=== DISPATCHING SIH DAILY PDF REPORT EMAIL RIGHT NOW ===');
  
  try {
    const res = await fetch('http://localhost:3000/api/cron/sih-daily-pdf-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    console.log('API Response:', data);

    if (res.ok && data.success) {
      console.log('\n===========================================================');
      console.log(`✅ SUCCESS! SIH Daily PDF Report has been dispatched to ${data.recipient || 'yashshah7117@gmail.com'}!`);
      console.log(`PDF Size: ${data.pdfSizeBytes} bytes`);
      console.log(`Resend ID / Status: ${data.resendId || data.message}`);
      console.log('===========================================================');
    } else {
      console.error('Failed to dispatch PDF email:', data);
    }
  } catch (err) {
    console.error('Error invoking API route:', err.message);
  }
}

sendSihPdfNow();
