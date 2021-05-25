import './style.css'

import firebase from 'firebase/app'
import 'firebase/firestore'

// Firebase config 
var firebaseConfig = {
  apiKey: "AIzaSyAZ_dUt3DKagFtqwktOzfjPKpD3VnoaZMg",
  authDomain: "tynfm-e3975.firebaseapp.com",
  projectId: "tynfm-e3975",
  storageBucket: "tynfm-e3975.appspot.com",
  messagingSenderId: "1017037560495",
  appId: "1:1017037560495:web:da77c7cd38e5a935d2d25a",
  measurementId: "G-6860981DCS"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig)
}

const firestore = firebase.firestore()

// ICE candidates

const servers = {
  iceServers: [
    {
      urls: ['stun:styn1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
    },
  ],
  iceCandidatePoolSize: 10,
}

// Global state

let pc = new RTCPeerConnection(servers)
let localStream = null
let remoteStream = null

// DOM manipulation

const webcamButton = document.getElementById('webcamButton')
const webcamVideo = document.getElementById('webcamVideo')
const callButton = document.getElementById('callButton')
const callInput = document.getElementById('callInput')
const answerButton = document.getElementById('answerButton')
const remoteVideo = document.getElementById('remoteVideo')
const hungupButton = document.getElementById('hangupButton')

// Media sources

webcamButton.onclick = async () => {
  const getUserMediaOptions = {
    video: true,
    audio: true
  }
  localStream = await navigator.mediaDevices.getUserMedia(getUserMediaOptions)
  remoteStream = new MediaStream()

  // Local stream becoming available to peer 
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream)
  })

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track)
    })
  }

  webcamVideo.srcObject = localStream
  remoteVideo.srcObject = remoteStream
}

// Create offer - SIGNALING

callButton.onclick = async () => {
  // Reference to firestore collection
  const docRef = firestore.collection('calls').doc()
  const offerCandidatesRef = firestore.collection('callsOfferCandidates')
  const answerCandidatesRef = firestore.collection('callsAnswerCandidates')

  callInput.value = docRef.id

  // Get candidates for caller, save to firestore db
  pc.onicecandidate = event => {
    event.candidate && offerCandidatesRef.add(event.candidate.toJSON())
  }

  // Create offer
  const offerDescription = await pc.createOffer()
  await pc.setLocalDescription(offerDescription) // contains the STP value !IMPORTANT!

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type
  }

  await docRef.set({ offer })

  // Listen for remote answer
  docRef.onSnapshot((snapshot) => {
    const data = snapshot.data()
    if (!pc.currentRemoteDescription && data?.answer){
      const answerDescription = new RTCSessionDescription(data.answer)
      pc.setRemoteDescription(answerDescription)
    }
  })

  // If answered, add candidate to peer connection
  answerCandidatesRef.onSnapshot(snapshot => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added'){
        const candidate = new RTCIceCandidate(change.doc.data())
        pc.addIceCandidate(candidate)
      }
    })
  })
}

// Answer the call with the unique Id 

answerButton.onclick = async () => {
  const callId = callInput.value
  const docRef = firestore.collection('calls').docs(callId)
  const answerCanidatesRef = docRef.collection('callsAnswerCandidates')

  pc.onicecandidate = event => {
    event.candidate && answerCanidatesRef.add(event.candidate.toJSON())
  }

  const callData = (await docRef.get()).data()
  
  const offerDescription = callData.offer
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription))

  const answerDescription = await pc.createAnswer()
  await pc.setLocalDescription(answerDescription)

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp
  }

  await docRef.update({ answer })

  offerCandidatesRef.onSnapshot((snapshot) => {
    let data = change.doc.data()
    pc.addIceCandidate(new RTCIceCandidate(data))
  })
}