import type { TranslationKey } from './en'

const es: Record<TranslationKey, string> = {
  // Navigation
  'nav.aboutMe': 'Sobre mí',
  'nav.faq': 'Preguntas frecuentes',
  'nav.blog': 'Blog',
  'nav.contact': 'Contacto',
  'nav.myAccount': 'Mi cuenta',
  'nav.viewAccount': 'Ver cuenta',
  'nav.logout': 'Cerrar sesión',
  'nav.logIn': 'Iniciar sesión',
  'nav.srOpenMenu': 'Abrir menú principal',
  'nav.srCloseMenu': 'Cerrar menú',
  'nav.srToggleTheme': 'Cambiar tema',
  'nav.srCompanyLogo': 'Versmedit',

  // Hero
  'hero.badge': 'Enfoque diario de VerseMedit.',
  'hero.badgeLink': 'Empieza a meditar',
  'hero.title': 'Memoriza la Biblia, medita en la Palabra de Dios',
  'hero.description':
    'Guarda las Escrituras en tu corazón a través de la repetición y reflexión diaria. VerseMedit te ayuda a crear categorías, repasar tus versículos y mantenerte arraigado en la Palabra cada día.',
  'hero.cta': 'Empieza a memorizar ahora',
  'hero.ctaSecondary': 'Ir a Mi cuenta',

  // Footer
  'footer.rights': 'Todos los derechos reservados.',
  'footer.privacy': 'Privacidad',
  'footer.terms': 'Términos',
  'footer.contact': 'Contacto',

  // About Me
  'aboutMe.title': 'Sobre mí',
  'aboutMe.description':
    'VerseMedit es una herramienta diseñada para ayudarte a memorizar las Escrituras a través de la repetición y reflexión diaria, usando el sistema de repetición espaciada de Leitner.',

  // Blog
  'blog.title': 'Blog',
  'blog.description': 'Aún no hay publicaciones. Vuelve pronto para novedades sobre VerseMedit.',

  // Contact
  'contact.title': 'Contacto',
  'contact.description': '¿Tienes preguntas o comentarios? Rellena el formulario y te responderemos.',
  'contact.firstName': 'Nombre',
  'contact.lastName': 'Apellido',
  'contact.email': 'Correo electrónico',
  'contact.message': 'Mensaje',
  'contact.agreePolicy': 'Al seleccionar esto, aceptas nuestra',
  'contact.privacyPolicy': 'política de privacidad',
  'contact.submit': 'Hablemos',

  // FAQ
  'faq.title': 'Preguntas frecuentes',
  'faq.description': 'Todo lo que necesitas saber sobre VerseMedit.',
  'faq.q1.title': '¿Cómo funciona el aprendizaje diario?',
  'faq.q1.content':
    'Cada día, el sistema selecciona tarjetas de tu caja según el calendario de Leitner. El objetivo es revisar las tarjetas en intervalos óptimos para una mejor retención.',
  'faq.q2.title': '¿Qué pasa cuando me sé un versículo?',
  'faq.q3.title': '¿Qué pasa si olvido un versículo mientras estudio?',
  'faq.q3.content':
    '¡No te preocupes! Si olvidas un versículo, simplemente devuélvelo al primer nivel y empieza de nuevo. La repetición te ayuda a guardar la Palabra de Dios en tu corazón. Cuanto más practiques, más fuerte y natural se vuelve el versículo en tu memoria.',
  'faq.q4.title': '¿Con qué frecuencia debo estudiar mis versículos?',
  'faq.q4.content':
    'Al memorizar las Escrituras con el sistema Leitner, es importante seguir tu calendario de repaso de forma consistente. Algunos versículos aparecerán a diario, mientras que otros surgirán semanalmente o con menos frecuencia a medida que avances. Confía en el proceso: cada versículo se repasa en el momento adecuado para ayudarte a recordarlo a largo plazo.',
  'faq.q5.title': '¿Por qué no tengo versículos para estudiar hoy?',
  'faq.q5.content':
    'Los versículos aparecen para repaso según tu calendario de Leitner. Cuanto más alto sea el nivel de un versículo, menos frecuentemente necesita ser repasado. Si no aparecen versículos hoy, simplemente significa que vas bien: nada está pendiente aún. ¡Sigue mañana!',
  'faq.q6.title': '¿Con qué frecuencia están disponibles los versículos para estudiar?',
  'faq.q7.title': '¿Qué pasa si me pierdo uno o dos días?',
  'faq.q7.content':
    'Cada versículo sigue su propio calendario individual, así que no hay una "ventana de 24 horas" estricta de la que preocuparse. Si te pierdes un día o dos de práctica, tus versículos no desaparecerán ni se reiniciarán. Simplemente permanecerán pendientes y podrás continuar tu memorización cuando regreses. De esta manera, tu progreso se mantiene intacto, incluso si te saltas un par de días.',
  'faq.q8.title': '¿Cuánto tiempo suele tardar en memorizar un versículo del Nivel 1 al Dominado?',
  'faq.q8.content':
    'Si recuerdas correctamente un versículo de forma consistente, progresará a través de todos los niveles en unos 120 días — aproximadamente cuatro meses — antes de alcanzar la etapa Dominado.',
  'faq.q9.title': '¿Puedo estudiar de nuevo los versículos dominados?',

  // My Account
  'myAccount.title': 'Mi cuenta',
  'myAccount.loading': 'Cargando cuenta...',
  'myAccount.loginRequired': 'Necesitas iniciar sesión para ver los detalles de tu cuenta.',
  'myAccount.description': 'Información de cuenta autenticada desde Better Auth.',
  'myAccount.name': 'Nombre',
  'myAccount.notSet': 'Sin definir',
  'myAccount.email': 'Correo electrónico',
  'myAccount.emailVerified': 'Correo verificado',
  'myAccount.yes': 'Sí',
  'myAccount.no': 'No',
  'myAccount.sessionExpires': 'La sesión expira',
  'myAccount.userId': 'ID de usuario',
  'myAccount.categories': 'Categorías',
  'myAccount.total': 'total',
  'myAccount.noCategories': 'Aún no hay categorías vinculadas a esta cuenta.',
  'myAccount.color': 'Color',
  'myAccount.none': 'Ninguno',
  'myAccount.verses': 'Versículos',
  'myAccount.levelSummary': 'Resumen por niveles',
  'myAccount.level': 'Nivel',
  'myAccount.versesCount': 'versículos',
  'myAccount.noVerses': 'Aún no hay versículos vinculados a esta cuenta.',
  'myAccount.category': 'Categoría',
  'myAccount.state': 'Estado',
  'myAccount.due': 'Pendiente',
  'myAccount.reviews': 'Repasos',
  'myAccount.success': 'éxito',
  'myAccount.fail': 'fallo',
  'myAccount.resets': 'Reinicios',

  // Not Found
  'notFound.code': '404',
  'notFound.title': 'Página no encontrada',
  'notFound.description': 'Lo sentimos, no pudimos encontrar la página que buscas.',
  'notFound.goHome': 'Volver al inicio',
  'notFound.contactSupport': 'Contactar soporte',

  // Sign Up
  'signUp.title': 'Registrarse',
  'signUp.description': 'Crea tu cuenta para empezar a memorizar las Escrituras.',
  'signUp.name': 'Nombre',
  'signUp.email': 'Correo electrónico',
  'signUp.password': 'Contraseña',
  'signUp.submit': 'Registrarse',
  'signUp.submitting': 'Creando cuenta...',
  'signUp.error': 'No se pudo crear la cuenta. Por favor, inténtalo de nuevo.',
  'signUp.successTitle': 'Cuenta creada',
  'signUp.successDescription': 'Tu cuenta se ha creado correctamente.',
  'signUp.goHome': 'Volver al inicio',

  // Login Modal
  'login.title': 'Inicia sesión en tu cuenta',
  'login.notMember': '¿No eres miembro?',
  'login.signUpLink': '¡Regístrate!',
  'login.email': 'Correo electrónico',
  'login.password': 'Contraseña',
  'login.submit': 'Iniciar sesión',
  'login.submitting': 'Iniciando sesión...',
  'login.error': 'Credenciales inválidas. Por favor, inténtalo de nuevo.',
  'login.srClose': 'Cerrar ventana de inicio de sesión',

  // Memorize
  'memorize.loading': 'Cargando versículos...',
  'memorize.loginRequired': 'Inicia sesión para acceder al modo memorizar.',
  'memorize.loadError': 'No se pudieron cargar los versículos. Por favor, inténtalo de nuevo.',
  'memorize.noVerses': 'No hay versículos pendientes de repaso ahora. ¡Sigue mañana o añade nuevos versículos!',

  // VersePlayer
  'versePlayer.tip': 'Consejo: Escribe la primera letra de cada palabra en orden para revelarlas.',
  'versePlayer.perfect': '¡Perfecto! Subes del nivel {currentLevel} al {nextLevel}.',
  'versePlayer.mastered': '¡Increíble! Has dominado este versículo.',
  'versePlayer.tryImprove': '¡Intenta mejorar la próxima vez! Vuelves al nivel 1.',
  'versePlayer.pressEnter': 'Pulsa Enter para continuar al siguiente versículo.',
  'versePlayer.persistError': 'No se pudo guardar tu progreso. Por favor, inténtalo de nuevo.',
  'versePlayer.showVerse': 'Mostrar versículo',
  'versePlayer.hideVerse': 'Ocultar versículo',
  'versePlayer.alreadyShown': 'Ya mostrado',
  'versePlayer.of': 'de',
  'versePlayer.nextVerse': 'Siguiente versículo',
  'versePlayer.noReviewNeeded': 'No se necesitan más repasos.',
  'versePlayer.savingSchedule': 'Guardando calendario de repasos...',
  'versePlayer.reviewToday': 'Se repasará de nuevo hoy.',
  'versePlayer.reviewTomorrow': 'Se repasará de nuevo mañana.',
  'versePlayer.reviewOn': 'Se repasará de nuevo el {date}.',

  // Language
  'language.en': 'English',
  'language.es': 'Español',
}

export default es
