document.addEventListener("DOMContentLoaded", () => {
  // Mobile nav toggle
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      nav.classList.toggle("open");
    });
  }

  // Text button (iOS-friendly)
  window.handleTextClick = function () {
    const phone = "14842238496";

    const guidedBody =
      "Hello I like what I seen on the About To Shine Cleaning Website and would like a free quote!\n\n" +
      "Floors:\nBedrooms:\nBathrooms:\nPets?:\nCity:";

    const wantsGuided = confirm("Would you like a guided quote text template?");
    const smsBase = `sms:${phone}`;

    if (wantsGuided) {
      const encoded = encodeURIComponent(guidedBody);
      // iOS is more reliable with &body=
      window.location.href = `${smsBase}&body=${encoded}`;
    } else {
      window.location.href = smsBase;
    }
  };
});

function handleTextClick(){
  const guided = confirm("Would you like a guided quote text?

OK = Guided quote
Cancel = Type your own");
  if (guided){
    window.location.href = "sms:14842238496?body=Hello%20I%20like%20what%20I%20seen%20on%20the%20About%20To%20Shine%20Cleaning%20Website%20and%20would%20like%20a%20free%20quote!%0A%0AFloors%3A%0ABedrooms%3A%0ABathrooms%3A%0APets%3F%3A%0ACity%3A";
  } else {
    window.location.href = "sms:14842238496";
  }
}
