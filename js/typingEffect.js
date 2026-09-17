// Terminal typing effect for hero
export function prefersReducedMotion() {
  return Boolean(
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function initTypingEffect(elementId, textArray, typingSpeed = 80, deletingSpeed = 50, pauseTime = 2000) {
  const el = document.getElementById(elementId);
  if (!el || !Array.isArray(textArray) || textArray.length === 0) return;

  // A typing animation is exactly the kind of motion this preference is about: show the
  // first phrase in full and don't animate at all.
  if (prefersReducedMotion()) {
    el.textContent = textArray[0];
    return;
  }

  let textIndex = 0;
  let charIndex = 0;
  let isDeleting = false;

  function type() {
    const currentText = textArray[textIndex];

    if (isDeleting) {
      el.textContent = currentText.substring(0, charIndex - 1);
      charIndex--;
    } else {
      el.textContent = currentText.substring(0, charIndex + 1);
      charIndex++;
    }

    let speed = isDeleting ? deletingSpeed : typingSpeed;

    if (!isDeleting && charIndex === currentText.length) {
      speed = pauseTime;
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      textIndex = (textIndex + 1) % textArray.length;
      speed = 500;
    }

    setTimeout(type, speed);
  }

  setTimeout(type, 1000);
}
