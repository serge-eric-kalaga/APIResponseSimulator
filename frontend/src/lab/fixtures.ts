import {blank, newVariable} from "./model.ts";
import type {Draft} from "./model.ts";
/** Fictional contracts for the pilot. Business expectations are checked by the calling system. */
export function referenceScenarios(): Draft[] {
  const validation = {...blank("Atlas"), name:"Validation de ressource", service:"Ressources",path:"/v1/resources",
    description:"Reproduire un paramètre invalide à la création d’une ressource.",tags:["Validation","Erreur HTTP"],
    status:400, variables:[newVariable()], body:'{\n  "code": "INVALID_REQUEST",\n  "message": "Paramètre invalide",\n  "reference": "{{reference}}"\n}',
    expected:"Le client affiche le refus de validation et ne relance pas automatiquement la demande."};
  const asyncDocument={...blank("Studio"),name:"Génération de document",service:"Documents",tags:["Asynchrone","Webhook"],
    description:"Accepter la demande puis notifier la disponibilité du document.",path:"/v1/documents",status:202,
    variables:[newVariable()],body:'{\n  "reference": "{{reference}}",\n  "etat": "pending"\n}',webhook:true,
    destination:"pilot-receiver",hookBody:'{\n  "reference": "{{reference}}",\n  "etat": "success"\n}',
    expected:"Le document reste en attente puis passe une seule fois à l’état disponible."};
  return [validation,asyncDocument,{...blank("Atlas"),name:"Acceptation sans référence",service:"Traitements",tags:["Réponse incomplète"],
    description:"Accepter le traitement sans attribuer de référence.",path:"/v1/requests",status:202,body:'{\n  "etat": "pending"\n}',
    expected:"La demande reste en attente de référence."},{...blank("Atlas"),name:"Refus explicite",service:"Traitements",tags:["Refus"],
    description:"Renvoyer le motif du refus au client.",path:"/v1/requests",status:422,body:'{\n  "etat": "refused",\n  "code": "REQUEST_REJECTED"\n}',
    expected:"La demande est classée en échec et le motif est visible."}];
}
