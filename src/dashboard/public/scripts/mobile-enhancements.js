// Mobile Enhancement Utilities for TradingBot Pro Dashboard
// Provides advanced mobile-specific functionality

class MobileEnhancements {
  constructor() {
    this.isTouch = 'ontouchstart' in window;
    this.isMobile = window.innerWidth <= 768;
    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    this.isAndroid = /Android/.test(navigator.userAgent);
    
    this.init();
  }

  init() {
    if (this.isMobile) {
      this.setupMobileOptimizations();
      this.setupPullToRefresh();
      this.setupTouchFeedback();
      this.setupVirtualKeyboardHandling();
      this.setupOfflineDetection();
    }
  }

  setupMobileOptimizations() {
    // Add mobile class to body
    document.body.classList.add('mobile-device');
    
    if (this.isIOS) {
      document.body.classList.add('ios-device');
    }
    
    if (this.isAndroid) {
      document.body.classList.add('android-device');
    }

    // Prevent zoom on input focus (iOS specific)
    if (this.isIOS) {
      const inputs = document.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        input.addEventListener('focus', () => {
          const viewport = document.querySelector('meta[name=viewport]');
          viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        });
        
        input.addEventListener('blur', () => {
          const viewport = document.querySelector('meta[name=viewport]');
          viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes');
        });
      });
    }

    // Handle safe area insets for notched devices
    this.handleSafeArea();
  }

  setupPullToRefresh() {
    let startY = 0;
    let pullDistance = 0;
    let isPullToRefresh = false;
    const threshold = 80;

    // Create pull-to-refresh indicator
    const indicator = document.createElement('div');
    indicator.className = 'pull-to-refresh';
    indicator.innerHTML = '<i class="fas fa-sync-alt"></i>';
    document.body.appendChild(indicator);

    document.addEventListener('touchstart', (e) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        isPullToRefresh = true;
      }
    });

    document.addEventListener('touchmove', (e) => {
      if (!isPullToRefresh || window.scrollY > 0) return;

      pullDistance = e.touches[0].clientY - startY;
      
      if (pullDistance > 0) {
        e.preventDefault();
        
        const progress = Math.min(pullDistance / threshold, 1);
        indicator.style.transform = `translateX(-50%) translateY(${pullDistance * 0.5}px) rotate(${progress * 180}deg)`;
        indicator.style.opacity = progress;
        
        if (progress >= 1) {
          indicator.classList.add('visible');
        } else {
          indicator.classList.remove('visible');
        }
      }
    });

    document.addEventListener('touchend', () => {
      if (!isPullToRefresh) return;

      if (pullDistance >= threshold) {
        this.triggerRefresh();
      }

      // Reset
      indicator.style.transform = 'translateX(-50%) translateY(-60px) rotate(0deg)';
      indicator.style.opacity = '0';
      indicator.classList.remove('visible');
      isPullToRefresh = false;
      pullDistance = 0;
    });
  }

  triggerRefresh() {
    const indicator = document.querySelector('.pull-to-refresh');
    indicator.classList.add('loading');
    
    // Trigger dashboard refresh
    if (window.dashboard && typeof window.dashboard.refreshData === 'function') {
      window.dashboard.refreshData().finally(() => {
        setTimeout(() => {
          indicator.classList.remove('loading');
        }, 500);
      });
    } else {
      // Fallback: reload page
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }

  setupTouchFeedback() {
    // Add haptic feedback for supported devices
    const addHapticFeedback = (element, type = 'light') => {
      element.addEventListener('touchstart', () => {
        if (navigator.vibrate) {
          const patterns = {
            light: [10],
            medium: [20],
            heavy: [30]
          };
          navigator.vibrate(patterns[type] || patterns.light);
        }
      });
    };

    // Add feedback to buttons
    document.querySelectorAll('.btn, .nav-link, .stat-card').forEach(el => {
      addHapticFeedback(el, 'light');
    });

    // Add visual touch feedback
    const addTouchRipple = (element) => {
      element.addEventListener('touchstart', (e) => {
        const ripple = document.createElement('span');
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.touches[0].clientX - rect.left - size / 2;
        const y = e.touches[0].clientY - rect.top - size / 2;
        
        ripple.style.cssText = `
          position: absolute;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          width: ${size}px;
          height: ${size}px;
          left: ${x}px;
          top: ${y}px;
          animation: ripple 0.6s ease-out;
          pointer-events: none;
          z-index: 1000;
        `;
        
        element.style.position = 'relative';
        element.style.overflow = 'hidden';
        element.appendChild(ripple);
        
        setTimeout(() => {
          ripple.remove();
        }, 600);
      });
    };

    // Add ripple effect to interactive elements
    document.querySelectorAll('.btn, .card, .nav-link').forEach(addTouchRipple);
  }

  setupVirtualKeyboardHandling() {
    // Handle virtual keyboard appearance
    let initialViewportHeight = window.innerHeight;
    
    window.addEventListener('resize', () => {
      const currentHeight = window.innerHeight;
      const heightDifference = initialViewportHeight - currentHeight;
      
      if (heightDifference > 150) {
        // Virtual keyboard is likely open
        document.body.classList.add('keyboard-open');
        
        // Adjust focused input into view
        const focusedElement = document.activeElement;
        if (focusedElement && (focusedElement.tagName === 'INPUT' || focusedElement.tagName === 'TEXTAREA')) {
          setTimeout(() => {
            focusedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }
      } else {
        document.body.classList.remove('keyboard-open');
      }
    });

    // Handle input focus/blur for better mobile experience
    document.addEventListener('focusin', (e) => {
      if (e.target.matches('input, textarea')) {
        setTimeout(() => {
          e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    });
  }

  setupOfflineDetection() {
    // Create offline indicator
    const offlineIndicator = document.createElement('div');
    offlineIndicator.className = 'offline-indicator';
    offlineIndicator.innerHTML = `
      <i class="fas fa-wifi-slash"></i>
      <span>You're offline</span>
    `;
    document.body.appendChild(offlineIndicator);

    const updateOnlineStatus = () => {
      if (navigator.onLine) {
        offlineIndicator.classList.remove('visible');
        document.body.classList.remove('offline');
      } else {
        offlineIndicator.classList.add('visible');
        document.body.classList.add('offline');
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Initial check
    updateOnlineStatus();
  }

  handleSafeArea() {
    // Add CSS custom properties for safe area insets
    const root = document.documentElement;
    
    // Check if device supports safe areas
    if (CSS.supports('padding: env(safe-area-inset-top)')) {
      root.style.setProperty('--safe-area-top', 'env(safe-area-inset-top)');
      root.style.setProperty('--safe-area-right', 'env(safe-area-inset-right)');
      root.style.setProperty('--safe-area-bottom', 'env(safe-area-inset-bottom)');
      root.style.setProperty('--safe-area-left', 'env(safe-area-inset-left)');
    } else {
      root.style.setProperty('--safe-area-top', '0px');
      root.style.setProperty('--safe-area-right', '0px');
      root.style.setProperty('--safe-area-bottom', '0px');
      root.style.setProperty('--safe-area-left', '0px');
    }
  }

  // Utility methods
  showMobileToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `mobile-toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('visible'), 100);
    
    // Remove after duration
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  optimizeImages() {
    // Lazy load images that are not in viewport
    const images = document.querySelectorAll('img[data-src]');
    
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.remove('lazy');
            imageObserver.unobserve(img);
          }
        });
      }, { threshold: 0.1 });

      images.forEach(img => imageObserver.observe(img));
    }
  }

  addSwipeGestures(element, callbacks) {
    let startX = 0;
    let startY = 0;
    let distanceX = 0;
    let distanceY = 0;

    element.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    });

    element.addEventListener('touchmove', (e) => {
      if (!startX || !startY) return;

      distanceX = e.touches[0].clientX - startX;
      distanceY = e.touches[0].clientY - startY;
    });

    element.addEventListener('touchend', () => {
      if (Math.abs(distanceX) > Math.abs(distanceY)) {
        // Horizontal swipe
        if (Math.abs(distanceX) > 50) {
          if (distanceX > 0 && callbacks.swipeRight) {
            callbacks.swipeRight();
          } else if (distanceX < 0 && callbacks.swipeLeft) {
            callbacks.swipeLeft();
          }
        }
      } else {
        // Vertical swipe
        if (Math.abs(distanceY) > 50) {
          if (distanceY > 0 && callbacks.swipeDown) {
            callbacks.swipeDown();
          } else if (distanceY < 0 && callbacks.swipeUp) {
            callbacks.swipeUp();
          }
        }
      }

      startX = 0;
      startY = 0;
      distanceX = 0;
      distanceY = 0;
    });
  }
}

// Initialize mobile enhancements when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.mobileEnhancements = new MobileEnhancements();
});

// Add CSS for mobile enhancements
const mobileStyles = `
<style>
.mobile-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  background: var(--gray-800);
  color: white;
  padding: 12px 20px;
  border-radius: 24px;
  font-size: 14px;
  z-index: 10000;
  opacity: 0;
  transition: all 0.3s ease;
  max-width: calc(100vw - 40px);
}

.mobile-toast.visible {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}

.mobile-toast.success { background: var(--success); }
.mobile-toast.error { background: var(--danger); }
.mobile-toast.warning { background: var(--warning); }

.offline-indicator {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: var(--danger);
  color: white;
  padding: 8px;
  text-align: center;
  font-size: 14px;
  transform: translateY(-100%);
  transition: transform 0.3s ease;
  z-index: 10000;
}

.offline-indicator.visible {
  transform: translateY(0);
}

/* Safe area adjustments */
.header { 
  padding-top: calc(var(--space-md) + var(--safe-area-top)); 
}

.sidebar {
  padding-top: var(--safe-area-top);
}

/* Keyboard open adjustments */
.keyboard-open .main-content {
  padding-bottom: 0;
}

/* Ripple animation */
@keyframes ripple {
  to {
    transform: scale(4);
    opacity: 0;
  }
}
</style>
`;

document.head.insertAdjacentHTML('beforeend', mobileStyles);
