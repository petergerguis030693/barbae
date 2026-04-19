window.addEventListener("scroll", () => {
  const header = document.getElementById("main-header");
  if (window.scrollY > 50) {
    header.classList.add("scrolled");
  } else {
    header.classList.remove("scrolled");
  }
});

// Burger-Menü Animation + Öffnen/Schließen
const burger = document.getElementById("burger");
const nav = document.getElementById("nav-links");

burger.addEventListener("click", () => {
  burger.classList.toggle("active");
  nav.classList.toggle("open");
});

// === Fade-In bei Scroll (Intersection Observer) ===
document.addEventListener("DOMContentLoaded", () => {
  const fadeElements = document.querySelectorAll(".fade-in");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target); // Nur einmal animieren
      }
    });
  }, { threshold: 0.2 });

  fadeElements.forEach(el => observer.observe(el));
});

let next = document.querySelector(".next");
let prev = document.querySelector(".prev");

next.addEventListener("click", () => {
  let items = document.querySelectorAll(".item");
  document.querySelector(".slide").appendChild(items[0]);
});

prev.addEventListener("click", () => {
  let items = document.querySelectorAll(".item");
  document.querySelector(".slide").prepend(items[items.length - 1]);
});
