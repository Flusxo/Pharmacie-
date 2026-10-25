/**
 * French versions of every user-facing API message. Keys are the English templates used in the code
 * (`{name}` = a variable part). `test/i18n.test.ts` fails if a message in the source has no entry here.
 */
export const FR: Record<string, string> = {
  // Errors (errors.ts, middleware)
  'No API route for {req_method} {req_path}': 'Aucune route d’API pour {req_method} {req_path}',
  'Invalid input — {summary}': 'Saisie invalide — {summary}',
  'The request body is not valid JSON.': 'Le corps de la requête n’est pas un JSON valide.',
  'The request body is too large.': 'Le corps de la requête est trop volumineux.',
  'This already exists.': 'Cet élément existe déjà.',
  'Team member not found.': 'Membre de l’équipe introuvable.',
  'An account with this email already exists.': 'Un compte existe déjà avec cet e-mail.',
  'Invalid identifier format.': 'Format d’identifiant invalide.',
  'This change would break a data rule (for example, stock below zero).':
    'Cette modification enfreindrait une règle de données (par exemple, un stock négatif).',
  'The database is not reachable. Start it with `npm run dev` (or `npm run db:reset`) and try again.':
    'La base de données est injoignable. Démarrez-la avec `npm run dev` (ou `npm run db:reset`) puis réessayez.',
  'Something went wrong on our side. Please try again.': 'Une erreur est survenue de notre côté. Veuillez réessayer.',
  'Please log in.': 'Veuillez vous connecter.',
  'You do not have access to this.': 'Vous n’avez pas accès à cette ressource.',
  'Not found.': 'Introuvable.',
  'Your staff role ({req_user_staffRole}) cannot do this.': 'Votre rôle d’équipe ({req_user_staffRole}) ne permet pas cette action.',
  'Your session has expired. Please log in again.': 'Votre session a expiré. Veuillez vous reconnecter.',
  'This account is suspended. Contact support.': 'Ce compte est suspendu. Contactez le support.',
  'Waiting for staff approval. You can use this feature once your account is verified.':
    'En attente de validation par l’équipe. Vous pourrez utiliser cette fonction une fois votre compte vérifié.',

  // Medicine proposals
  'looks like an existing medicine ({existingName}, {existingCip}): use its CIP13 code':
    'ressemble à un médicament existant ({existingName}, {existingCip}) : utilisez son code CIP13',
  'A medicine with this CIP13 code has already been proposed and is waiting for review.':
    'Un médicament avec ce code CIP13 a déjà été proposé et attend sa validation.',
  'You already have {MAX_PENDING_PER_PHARMACY} proposals waiting for review. Wait for staff to review them.':
    'Vous avez déjà {MAX_PENDING_PER_PHARMACY} propositions en attente de validation. Attendez que l’équipe les examine.',
  'Medicine proposal not found.': 'Proposition de médicament introuvable.',
  'This proposal has already been reviewed.': 'Cette proposition a déjà été examinée.',
  'A medicine with this CIP13 code already exists. Use it instead of creating a new one.':
    'Un médicament avec ce code CIP13 existe déjà. Utilisez-le plutôt que d’en créer un nouveau.',
  'This medicine looks like one that already exists. Use the existing one, or confirm that yours is different.':
    'Ce médicament ressemble à un médicament existant. Utilisez l’existant, ou confirmez que le vôtre est différent.',
  'Your medicine proposal was approved. Patients can now find it.':
    'Votre proposition de médicament a été approuvée. Les patients peuvent désormais le trouver.',
  'Your medicine proposal was not accepted: {why}': 'Votre proposition de médicament n’a pas été acceptée : {why}',
  'see the review note': 'voir la note de validation',
  'Update on your medicine proposal': 'Mise à jour de votre proposition de médicament',

  // Payments (Stripe test mode)
  'Payments not configured. Ask the administrator to set the Stripe test keys.':
    'Paiements non configurés. Demandez à l’administrateur de renseigner les clés de test Stripe.',
  'Only Stripe test keys are accepted: this prototype never handles real money.':
    'Seules les clés de test Stripe sont acceptées : ce prototype ne manipule jamais d’argent réel.',
  'This order can no longer be paid.': 'Cette commande ne peut plus être payée.',
  'This order is already paid.': 'Cette commande est déjà payée.',
  'Nothing to pay: the pharmacy has not set a price for this order.':
    'Rien à payer : la pharmacie n’a pas fixé de prix pour cette commande.',
  'The payment page could not be created. Please try again.': 'La page de paiement n’a pas pu être créée. Veuillez réessayer.',
  'There is no receipt for this order yet.': 'Il n’y a pas encore de reçu pour cette commande.',
  'A patient paid an order (test mode). The amount is held until the order is ready.':
    'Un patient a payé une commande (mode test). Le montant est bloqué jusqu’à ce que la commande soit prête.',
  'Invalid webhook signature.': 'Signature de webhook invalide.',

  // Admin
  'No {kind} with this id.': 'Aucun élément ({kind}) avec cet identifiant.',
  'User not found.': 'Utilisateur introuvable.',
  'You cannot change the status of your own account.': 'Vous ne pouvez pas modifier le statut de votre propre compte.',
  'Only an admin can change a staff account.': 'Seul un administrateur peut modifier un compte d’équipe.',
  'This account is already suspended.': 'Ce compte est déjà suspendu.',
  'This account is not suspended.': 'Ce compte n’est pas suspendu.',
  'An account with this email already exists.': 'Un compte existe déjà avec cette adresse e-mail.',
  'Nothing to update.': 'Rien à modifier.',
  'Medicine not found.': 'Médicament introuvable.',
  'No open report with this id.': 'Aucun signalement ouvert avec cet identifiant.',
  'Your account has been verified. You can now use all features.':
    'Votre compte a été vérifié. Vous pouvez maintenant utiliser toutes les fonctions.',
  'Your account could not be verified: {body_reason}': 'Votre compte n’a pas pu être vérifié : {body_reason}',

  // Auth
  'An account with this email already exists. Try logging in or resetting your password.':
    'Un compte existe déjà avec cette adresse e-mail. Connectez-vous ou réinitialisez votre mot de passe.',
  'This RPPS number is already registered.': 'Ce numéro RPPS est déjà enregistré.',
  'This FINESS number is already registered.': 'Ce numéro FINESS est déjà enregistré.',
  'Invalid email or password.': 'E-mail ou mot de passe incorrect.',
  'This reset link is invalid, expired or already used. Ask for a new one.':
    'Ce lien de réinitialisation est invalide, expiré ou déjà utilisé. Demandez-en un nouveau.',
  'Your current password is not correct.': 'Votre mot de passe actuel est incorrect.',
  'Two-step verification is already on. Turn it off first to set up a new app.':
    'La validation en deux étapes est déjà activée. Désactivez-la d’abord pour configurer une nouvelle application.',
  'Two-step verification is already on.': 'La validation en deux étapes est déjà activée.',
  'Start the setup first.': 'Commencez d’abord la configuration.',
  'The code is not correct. Check the time on your phone and try the next code.':
    'Le code est incorrect. Vérifiez l’heure de votre téléphone et essayez le code suivant.',
  'Two-step verification is not on.': 'La validation en deux étapes n’est pas activée.',
  'Your password is not correct.': 'Votre mot de passe est incorrect.',
  'The code is not correct.': 'Le code est incorrect.',
  'Enter the 6-digit code from your authenticator app.': 'Saisissez le code à 6 chiffres de votre application d’authentification.',
  'The code is not correct or was already used. Wait for the next code.': 'Code incorrect ou déjà utilisé. Attendez le code suivant.',
  'Two-step verification is available for doctor, pharmacy and staff accounts.':
    'La validation en deux étapes est disponible pour les comptes médecin, pharmacie et équipe.',
  'Too many login attempts from this network. Please wait a few minutes.':
    'Trop de tentatives de connexion depuis ce réseau. Patientez quelques minutes.',
  'Too many sign-ups from this network. Please try again later.': 'Trop d’inscriptions depuis ce réseau. Réessayez plus tard.',
  'Too many password reset requests. Please wait a few minutes.': 'Trop de demandes de réinitialisation. Patientez quelques minutes.',
  'If an account exists for this email, a reset link has been sent.':
    'Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé.',
  'Your password has been changed. You can now log in.': 'Votre mot de passe a été modifié. Vous pouvez vous connecter.',
  'Password changed.': 'Mot de passe modifié.',

  // Common, doctor, patient, pharmacy
  'Notification not found.': 'Notification introuvable.',
  'Thank you. Our team will look at your report.': 'Merci. Notre équipe va examiner votre signalement.',
  'No link with this patient.': 'Aucun lien avec ce patient.',
  'Template not found.': 'Modèle introuvable.',
  'Dr {d_last_name} would like to link to your account. Confirm only if you know this doctor.':
    'Le Dr {d_last_name} souhaite être lié à votre compte. Confirmez uniquement si vous connaissez ce médecin.',
  'No link request from this doctor.': 'Aucune demande de lien de ce médecin.',
  'No link with this doctor.': 'Aucun lien avec ce médecin.',
  'You have an order in progress. Wait until it is delivered or cancelled before deleting your account.':
    'Vous avez une commande en cours. Attendez qu’elle soit livrée ou annulée avant de supprimer votre compte.',
  '{p_first_name} {p_last_name_charAt_0}. confirmed the link.': '{p_first_name} {p_last_name_charAt_0}. a confirmé le lien.',
  'This medicine does not exist.': 'Ce médicament n’existe pas.',
  'This medicine is not in your stock.': 'Ce médicament n’est pas dans votre stock.',
  'The first line must be the header: cip13,quantity,price_eur (optional: low_stock_threshold).':
    'La première ligne doit être l’en-tête : cip13,quantity,price_eur (facultatif : low_stock_threshold).',
  'At most 2000 rows per upload.': '2000 lignes au maximum par envoi.',
  'Fix the {errors} row(s) with errors before applying.': 'Corrigez la ou les {errors} ligne(s) en erreur avant d’appliquer.',
  'This pharmacy is not available.': 'Cette pharmacie n’est pas disponible.',
  'The pharmacy did not answer in time. Please choose another pharmacy.':
    'La pharmacie n’a pas répondu à temps. Veuillez choisir une autre pharmacie.',
  'Your request expired because no pharmacy accepted it within 24 hours.':
    'Votre demande a expiré car aucune pharmacie ne l’a acceptée sous 24 heures.',
  'Order not found.': 'Commande introuvable.',
  'An order cannot go from "{o_status}" to "{to}".': 'Une commande ne peut pas passer de « {o_status} » à « {to} ».',
  'This order can no longer be cancelled (status: {o_status}).': 'Cette commande ne peut plus être annulée (statut : {o_status}).',
  'You already asked to cancel this order.': 'Vous avez déjà demandé l’annulation de cette commande.',
  'There is no cancellation request for this order.': 'Il n’y a pas de demande d’annulation pour cette commande.',
  'Confirm that you checked the prescription before preparing this order.':
    'Confirmez que vous avez vérifié l’ordonnance avant de préparer cette commande.',
  'This tracking link has expired.': 'Ce lien de suivi a expiré.',
  'Update on your request: your order is {STATUS_TEXT_to}.': 'Votre demande a évolué : votre commande est {STATUS_TEXT_to}.',
  'A patient cancelled an order before preparation. The stock was returned.':
    'Un patient a annulé une commande avant sa préparation. Le stock a été rétabli.',
  'A patient asks to cancel an order. Please approve or decline.': 'Un patient demande l’annulation d’une commande. Acceptez ou refusez.',
  'Update on your request: the pharmacy could not cancel your order.':
    'Votre demande a évolué : la pharmacie n’a pas pu annuler votre commande.',
  'Account not found.': 'Compte introuvable.',
  'items: at most 10 boxes of the same medicine per request': 'items : 10 boîtes au maximum du même médicament par demande',
  'You can only send requests for patients who have confirmed the link with you.':
    'Vous ne pouvez envoyer des demandes que pour les patients qui ont confirmé le lien avec vous.',
  'Patient not found.': 'Patient introuvable.',
  'items: one of the medicines does not exist': 'items : l’un des médicaments n’existe pas',
  'Request not found.': 'Demande introuvable.',
  'This request is not waiting for a pharmacy choice (status: {r_status}).':
    'Cette demande n’attend pas de choix de pharmacie (statut : {r_status}).',
  'This pharmacy cannot take requests right now. Please choose another one.':
    'Cette pharmacie ne peut pas prendre de demandes pour le moment. Veuillez en choisir une autre.',
  'This pharmacy already declined this request. Please choose another one.':
    'Cette pharmacie a déjà refusé cette demande. Veuillez en choisir une autre.',
  'This pharmacy does not have these medicines in stock.': 'Cette pharmacie n’a pas ces médicaments en stock.',
  'This pharmacy has only part of your request. Confirm that the missing items will not be included.':
    'Cette pharmacie n’a qu’une partie de votre demande. Confirmez que les produits manquants ne seront pas inclus.',
  'This request is no longer waiting for a pharmacy.': 'Cette demande n’attend plus de pharmacie.',
  'This request is not waiting for your answer.': 'Cette demande n’attend pas votre réponse.',
  'Your pharmacy is marked "all out of stock". Switch it back on before accepting.':
    'Votre pharmacie est marquée « tout en rupture ». Réactivez-la avant d’accepter.',
  'A prescription medicine is in this request without the prescription statement.':
    'Cette demande contient un médicament sur ordonnance sans la déclaration d’ordonnance.',
  'Not enough stock for one of the items. Update your stock or refuse the request.':
    'Stock insuffisant pour l’un des produits. Mettez à jour votre stock ou refusez la demande.',
  'Item not found in this request.': 'Produit introuvable dans cette demande.',
  'The proposed medicine must have the same active substance and dosage.':
    'Le médicament proposé doit avoir la même substance active et le même dosage.',
  'You do not have enough stock of the proposed medicine.': 'Vous n’avez pas assez de stock du médicament proposé.',
  'There is no proposal waiting for your answer.': 'Aucune proposition n’attend votre réponse.',
  'Proposal not found.': 'Proposition introuvable.',
  'This request already has an order. Cancel the order instead.': 'Cette demande a déjà une commande. Annulez plutôt la commande.',
  'This request can no longer be cancelled (status: {r_status}).': 'Cette demande ne peut plus être annulée (statut : {r_status}).',
  'This request contains a prescription medicine. Confirm that you will show your prescription at the pharmacy.':
    'Cette demande contient un médicament sur ordonnance. Confirmez que vous présenterez votre ordonnance à la pharmacie.',
  'Dr {d_last_name} prepared a request for you. Choose the pharmacy you prefer.':
    'Le Dr {d_last_name} a préparé une demande pour vous. Choisissez la pharmacie que vous préférez.',
  'New request from a patient. Please answer within {RULES_PHARMACY_RESPONSE_MINUTES} minutes.':
    'Nouvelle demande d’un patient. Merci de répondre sous {RULES_PHARMACY_RESPONSE_MINUTES} minutes.',
  'Your request was sent to {ph_name}.': 'Votre demande a été envoyée à {ph_name}.',
  '{ph_name_The_pharmacy} accepted your request.': '{ph_name_The_pharmacy} a accepté votre demande.',
  'The pharmacy could not take your request. Please choose another pharmacy.':
    'La pharmacie n’a pas pu prendre votre demande. Veuillez choisir une autre pharmacie.',
  'The pharmacy proposes an equivalent generic. Please approve or decline.':
    'La pharmacie propose un générique équivalent. Acceptez ou refusez.',
  'A patient cancelled a request sent to you.': 'Un patient a annulé une demande qui vous était adressée.',

  // Contact page
  'Too many messages from this network. Please try again later.': 'Trop de messages depuis ce réseau. Réessayez plus tard.',
  'Thank you. Your message has been sent to our team.': 'Merci. Votre message a été transmis à notre équipe.',
  'No open message with this id.': 'Aucun message en attente avec cet identifiant.',
  'please confirm that you are not sending health data': 'confirmez que vous n’envoyez pas de données de santé',
  'must be empty': 'doit rester vide',
  'must be at least 3 characters': 'doit contenir au moins 3 caractères',
  'must be at least 10 characters': 'doit contenir au moins 10 caractères',

  // Validation messages (zod custom messages; the field name is added in front)
  'is required': 'est obligatoire',
  'is empty': 'est vide',
  'is too long': 'est trop long',
  'is not a valid link': 'n’est pas un lien valide',
  'is not a valid reset token': 'n’est pas un jeton de réinitialisation valide',
  'must be a valid identifier': 'doit être un identifiant valide',
  'must be a valid email address': 'doit être une adresse e-mail valide',
  'must be an http(s) URL': 'doit être une adresse http(s)',
  'must be 13 digits': 'doit comporter 13 chiffres',
  'must be at least 1': 'doit valoir au moins 1',
  'must be at most 10': 'doit valoir au plus 10',
  'must be at least {RULES_MIN_PASSWORD} characters': 'doit contenir au moins {RULES_MIN_PASSWORD} caractères',
  'must be the 11-digit RPPS number': 'doit être le numéro RPPS à 11 chiffres',
  'must be the 9-digit FINESS number': 'doit être le numéro FINESS à 9 chiffres',
  'must be the 6-digit code from your authenticator app': 'doit être le code à 6 chiffres de votre application d’authentification',
  'cannot be negative': 'ne peut pas être négatif',
  'add at least one medicine': 'ajoutez au moins un médicament',
  'at most 20 different medicines': '20 médicaments différents au maximum',
  'a reason is required to reject': 'un motif est obligatoire pour refuser',
  'a reason is required (at least 3 characters)': 'un motif est obligatoire (au moins 3 caractères)',

  // CSV stock upload: row errors
  'cip13 must be 13 digits': 'le cip13 doit comporter 13 chiffres',
  'unknown CIP13 code': 'code CIP13 inconnu',
  'this CIP13 appears twice': 'ce CIP13 apparaît deux fois',
  'quantity must be a whole number ≥ 0': 'la quantité doit être un nombre entier ≥ 0',
  'price_eur must be a number ≥ 0': 'price_eur doit être un nombre ≥ 0',
  'low_stock_threshold must be a whole number ≥ 0': 'low_stock_threshold doit être un nombre entier ≥ 0',

  // Emails (notify.ts, auth.ts)
  'Update on your request': 'Votre demande a évolué',
  'New request on counter.': 'Nouvelle demande sur counter.',
  'A doctor would like to link to your account': 'Un médecin souhaite être lié à votre compte',
  'Your account has been verified': 'Votre compte a été vérifié',
  'Update on your account': 'Votre compte a évolué',
  'Update on an order': 'Une commande a évolué',
  'Reset your password': 'Réinitialisez votre mot de passe',
  'Use this link within {RULES_RESET_TOKEN_MINUTES} minutes: {link}':
    'Utilisez ce lien dans les {RULES_RESET_TOKEN_MINUTES} minutes : {link}',
  'Open counter. to see the details: {link}': 'Ouvrez counter. pour voir le détail : {link}',
  'Open counter. to see the details.': 'Ouvrez counter. pour voir le détail.',
};

/** Words that appear inside messages as values (order statuses, fallback names). */
export const FR_VALUES: Record<string, string> = {
  accepted: 'acceptée',
  'being prepared': 'en préparation',
  ready: 'prête',
  'on its way (simulated)': 'en route (simulé)',
  delivered: 'livrée',
  cancelled: 'annulée',
  preparing: 'en préparation',
  out_for_delivery: 'en livraison',
  received: 'à envoyer',
  sent_to_pharmacy: 'envoyée à la pharmacie',
  awaiting_patient_approval: 'en attente de votre accord',
  expired: 'expirée',
  'The pharmacy': 'La pharmacie',
};

/** Field names shown in validation messages. */
export const FR_FIELDS: Record<string, string> = {
  email: 'e-mail',
  password: 'mot de passe',
  currentPassword: 'mot de passe actuel',
  newPassword: 'nouveau mot de passe',
  firstName: 'prénom',
  lastName: 'nom',
  name: 'nom',
  phone: 'téléphone',
  address: 'adresse',
  city: 'ville',
  birthDate: 'date de naissance',
  code: 'code',
  reason: 'motif',
  quantity: 'quantité',
  items: 'produits',
  message: 'message',
  subject: 'objet',
  topic: 'sujet',
  noHealthData: 'données de santé',
  website: 'site web',
  '(body)': '(requête)',
};

/** Messages that only developers see at startup (not translated). */
export const DEV_ONLY = new Set(['DATABASE_URL is required (copy .env.example to .env)', 'JWT_SECRET must be at least 16 characters']);
